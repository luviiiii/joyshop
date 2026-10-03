import { authenticate } from "../shopify.server";
import db from "../db.server";

const WELCOME_DISCOUNT_CODE = "WELCOME200";

/* =========================================================
   HELPERS
========================================================= */

/*
 * Commission slabs (flat rate on the whole monthly total):
 *   Up to ₹30,000      -> 7%
 *   ₹30,001 - ₹60,000  -> 10%
 *   Above ₹60,000      -> 15%
 */
function getSlabRate(monthlyTotal) {
  if (monthlyTotal <= 30000) return 7;
  if (monthlyTotal <= 60000) return 10;
  return 15;
}

/*
 * Calendar month in INDIA time (IST, UTC+5:30), returned as UTC
 * instants. The server runs in UTC, so plain `new Date(y, m, 1)`
 * would start the month at 5:30 AM IST and put early-morning
 * orders on the 1st into the previous month's slab.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;

function istMonthRange(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();

  return {
    start: new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - IST_OFFSET_MS),
  };
}

/* =========================================================
   WEBHOOK
========================================================= */

export const action = async ({ request }) => {
  // Authentication errors must surface as Shopify expects (401).
  const { shop, topic, payload, session } = await authenticate.webhook(request);

  try {
    console.log("========================================");
    console.log("JOYSHOP ORDER WEBHOOK");
    console.log("Topic:", topic, "| Shop:", shop);

    if (!session) {
      console.log("No Shopify session available.");
      return new Response();
    }

    if (topic !== "ORDERS_PAID") {
      console.log("Ignoring webhook topic:", topic);
      return new Response();
    }

    const order = payload;

    const customerId = order.customer?.id ? String(order.customer.id) : null;
    const orderId = order.id ? String(order.id) : null;

    /*
     * Two DIFFERENT amounts:
     * - eligibilityOrderAmount: pre-discount subtotal, ONLY for the
     *   ambassador-eligibility check.
     * - commissionOrderAmount: what the customer actually paid, for
     *   slab totals and commission.
     */
    const eligibilityOrderAmount = Number(
      order.total_line_items_price ||
        order.subtotal_price ||
        order.current_total_price ||
        order.total_price ||
        0
    );

    const commissionOrderAmount = Number(
      order.current_total_price || order.total_price || 0
    );

    console.log("Order:", order.name, "| ID:", orderId, "| Customer:", customerId);
    console.log("Eligibility amount:", eligibilityOrderAmount, "| Commission amount:", commissionOrderAmount);

    if (!orderId) {
      console.log("Missing order ID");
      return new Response();
    }

    /* =====================================================
       1. AMBASSADOR ELIGIBILITY (single order >= threshold)
    ===================================================== */

    if (customerId) {
      try {
        let settings = await db.referralSettings.findUnique({ where: { shop } });

        if (!settings) {
          settings = await db.referralSettings.create({ data: { shop } });
        }

        const eligibilityAmount = Number(settings.ambassadorEligibilityAmount);

        const existingAmbassador = await db.ambassador.findFirst({
          where: { shop, customerId },
        });

        const isEligible = eligibilityOrderAmount >= eligibilityAmount;

        const existingEligibility = await db.ambassadorEligibility.findUnique({
          where: { shop_customerId: { shop, customerId } },
        });

        if (isEligible && !existingAmbassador) {
          await db.ambassadorEligibility.upsert({
            where: { shop_customerId: { shop, customerId } },
            update: {
              eligible: true,
              totalSpent: eligibilityOrderAmount,
              eligibleAt: existingEligibility?.eligibleAt || new Date(),
              notifiedAt: null,
            },
            create: {
              shop,
              customerId,
              eligible: true,
              totalSpent: eligibilityOrderAmount,
              eligibleAt: new Date(),
            },
          });

          console.log("🎉 CUSTOMER IS NOW ELIGIBLE:", customerId);
        } else if (!existingAmbassador) {
          await db.ambassadorEligibility.upsert({
            where: { shop_customerId: { shop, customerId } },
            update: {
              eligible: existingEligibility?.eligible || false,
            },
            create: {
              shop,
              customerId,
              totalSpent: eligibilityOrderAmount,
              eligible: false,
              eligibleAt: null,
            },
          });
        }
      } catch (eligibilityError) {
        // Eligibility must not block commission processing.
        console.error("AMBASSADOR ELIGIBILITY ERROR:", eligibilityError);
      }
    }

    /* =====================================================
       2. MARK THE WELCOME CREDIT AS USED
    ===================================================== */

    if (customerId) {
      try {
        const usedWelcomeCode = (order.discount_codes || []).some(
          (discount) =>
            String(discount?.code || "").toUpperCase() === WELCOME_DISCOUNT_CODE
        );

        if (usedWelcomeCode) {
          const updated = await db.referralCredit.updateMany({
            where: { shop, customerId, status: { in: ["ISSUED", "AVAILABLE"] } },
            data: { status: "USED", orderId, usedAt: new Date() },
          });

          console.log("Welcome credit marked used:", updated.count);
        }
      } catch (creditError) {
        console.error("WELCOME CREDIT UPDATE ERROR:", creditError);
      }
    }

    /* =====================================================
       3. DUPLICATE PROTECTION
    ===================================================== */

    const existingCommission = await db.commission.findUnique({
      where: { shop_orderId: { shop, orderId } },
    });

    if (existingCommission) {
      console.log("Commission already exists:", existingCommission.id);
      return new Response();
    }

    /* =====================================================
       4. FIND THE REFERRAL (by customer only)

       The old "joyshop_referral" note-attribute fallback picked ANY
       referral of that ambassador — i.e. another customer's row —
       so it has been removed. Referrals are linked by customer ID.
    ===================================================== */

    if (!customerId) {
      console.log("Guest order (no customer) — no referral possible.");
      return new Response();
    }

    const referral = await db.referral.findFirst({
      where: { shop, referredCustomerId: customerId, status: "ACTIVE" },
      include: { ambassador: true },
    });

    if (!referral) {
      console.log("No referral found for this order.");
      return new Response();
    }

    const ambassador = referral.ambassador;

    if (ambassador.status !== "ACTIVE") {
      console.log("Ambassador is not active — no commission:", ambassador.id, ambassador.status);
      return new Response();
    }

    console.log("Referral:", referral.id, "| Ambassador:", ambassador.name);

    /* =====================================================
       5. CREATE COMMISSION + APPLY MONTHLY SLAB (atomic)

       Everything below happens in ONE transaction. If anything
       fails, nothing is saved and we return 500 so Shopify
       retries — no more half-saved commissions stuck at 0%.
    ===================================================== */

    const { start: monthStart, end: monthEnd } = istMonthRange(new Date());

    let result;

    try {
      result = await db.$transaction(
        async (tx) => {
          const commission = await tx.commission.create({
            data: {
              shop,
              ambassadorId: ambassador.id,
              referralId: referral.id,
              customerId,
              orderId,
              orderAmount: commissionOrderAmount,
              commissionRate: 0,
              commissionAmount: 0,
              status: "PENDING",
            },
          });

          const monthlyCommissions = await tx.commission.findMany({
            where: {
              shop,
              ambassadorId: ambassador.id,
              status: { not: "REJECTED" },
              createdAt: { gte: monthStart, lt: monthEnd },
            },
          });

          const monthlyTotal = monthlyCommissions.reduce(
            (sum, item) => sum + Number(item.orderAmount || 0),
            0
          );

          const commissionRate = getSlabRate(monthlyTotal);

          let otherPendingDelta = 0;

          for (const item of monthlyCommissions) {
            if (item.status !== "PENDING") continue;

            const recalculated = (Number(item.orderAmount || 0) * commissionRate) / 100;

            await tx.commission.update({
              where: { id: item.id },
              data: { commissionRate, commissionAmount: recalculated },
            });

            if (item.id !== commission.id) {
              otherPendingDelta += recalculated - Number(item.commissionAmount || 0);
            }
          }

          const commissionAmount = (commissionOrderAmount * commissionRate) / 100;

          await tx.ambassador.update({
            where: { id: ambassador.id },
            data: {
              totalOrders: { increment: 1 },
              totalEarnings: { increment: commissionAmount + otherPendingDelta },
            },
          });

          return { commission, commissionRate, commissionAmount, monthlyTotal };
        },
        { timeout: 20000 }
      );
    } catch (txError) {
      // A parallel delivery of the same webhook already saved it.
      if (txError?.code === "P2002") {
        console.log("Commission was created by a parallel delivery — done.");
        return new Response();
      }
      throw txError;
    }

    console.log(
      "Monthly total (IST):",
      result.monthlyTotal,
      "| Rate:",
      result.commissionRate + "%",
      "| This order's commission:",
      result.commissionAmount,
      "| Commission ID:",
      result.commission.id
    );

    /* =====================================================
       6. MARK THIS CUSTOMER'S VISITS CONVERTED (analytics only)
    ===================================================== */

    try {
      await db.referralVisit.updateMany({
        where: {
          shop,
          referralCode: ambassador.referralCode,
          customerId,
          converted: false,
        },
        data: { converted: true, convertedAt: new Date() },
      });
    } catch (visitError) {
      console.error("VISIT CONVERSION UPDATE ERROR:", visitError);
    }

    console.log("========================================");
    return new Response();
  } catch (error) {
    console.error("========================================");
    console.error("JOYSHOP ORDER WEBHOOK ERROR — Shopify will retry");
    console.error(error);
    console.error("========================================");

    // 500 makes Shopify retry the webhook. Safe because of the
    // duplicate check above and the all-or-nothing transaction.
    return new Response("Webhook processing failed", { status: 500 });
  }
};
