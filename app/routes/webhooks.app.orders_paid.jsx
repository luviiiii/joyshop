import { authenticate } from "../shopify.server";
import db from "../db.server";

function customerGid(customerId) {
  if (!customerId) {
    return null;
  }

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

export const action = async ({ request }) => {
  try {
    const {
      shop,
      topic,
      payload,
      admin,
      session,
    } = await authenticate.webhook(request);

    console.log("========================================");
    console.log("JOYSHOP ORDER WEBHOOK");
    console.log("Topic:", topic);
    console.log("Shop:", shop);

    if (!session) {
      console.log("No Shopify session available.");
      console.log("========================================");

      return new Response();
    }

    const order = payload;

    console.log("Order ID:", order.id);
    console.log("Order Name:", order.name);
    console.log(
      "Financial Status:",
      order.financial_status
    );

    /*
     * Only process paid orders
     */

    if (topic !== "ORDERS_PAID") {
      console.log(
        "Ignoring webhook topic:",
        topic
      );

      return new Response();
    }

    /*
     * Shopify customer ID
     */

    const customerId = order.customer?.id
      ? String(order.customer.id)
      : null;

    /*
     * Shopify order ID
     */

    const orderId = order.id
      ? String(order.id)
      : null;

    /*
     * Order amount
     *
     * IMPORTANT:
     * This is the amount of THIS order only — used both for
     * commission calculation AND ambassador eligibility, since
     * eligibility is based on a single qualifying order, not
     * cumulative lifetime spend.
     */

    const orderAmount = Number(
      order.current_total_price ||
        order.total_price ||
        0
    );

    console.log(
      "Customer ID:",
      customerId
    );

    console.log(
      "Order ID:",
      orderId
    );

    console.log(
      "Order Amount:",
      orderAmount
    );

    if (!orderId) {
      console.log(
        "Missing order ID"
      );

      return new Response();
    }

    /*
     * =====================================================
     * 1. AMBASSADOR ELIGIBILITY
     *
     * Eligibility rule: a SINGLE order of ₹10,000 or more
     * qualifies a customer to become an ambassador. This is
     * checked against orderAmount (this order), NOT the
     * customer's cumulative lifetime spend.
     * =====================================================
     */

    if (customerId) {
      try {
        /*
         * Load referral settings
         */

        let settings =
          await db.referralSettings.findUnique({
            where: {
              shop,
            },
          });

        /*
         * Create default settings if missing
         */

        if (!settings) {
          settings =
            await db.referralSettings.create({
              data: {
                shop,
              },
            });
        }

        const eligibilityAmount =
          Number(
            settings.ambassadorEligibilityAmount
          );

        console.log(
          "This order's amount:",
          orderAmount
        );

        console.log(
          "Ambassador eligibility threshold:",
          eligibilityAmount
        );

        /*
         * Check if customer is already ambassador
         */

        const existingAmbassador =
          await db.ambassador.findFirst({
            where: {
              shop,
              customerId,
            },
          });

        /*
         * Determine eligibility based on THIS order alone.
         */

        const isEligible =
          orderAmount >= eligibilityAmount;

        /*
         * Get existing eligibility record
         */

        const existingEligibility =
          await db.ambassadorEligibility.findUnique({
            where: {
              shop_customerId: {
                shop,
                customerId,
              },
            },
          });

        /*
         * Customer's order qualifies them
         */

        if (
          isEligible &&
          !existingAmbassador
        ) {
          await db.ambassadorEligibility.upsert({
            where: {
              shop_customerId: {
                shop,
                customerId,
              },
            },

            update: {
              eligible: true,
              totalSpent: orderAmount,

              /*
               * Once eligible, stay eligible (until they
               * join) — don't reset eligibleAt if they were
               * already eligible from a previous order.
               */
              eligibleAt:
                existingEligibility?.eligibleAt ||
                new Date(),

              /*
               * A new qualifying order should trigger a
               * fresh popup even if we'd already notified
               * them once and they dismissed it.
               */
              notifiedAt: null,
            },

            create: {
              shop,
              customerId,
              eligible: true,
              totalSpent: orderAmount,
              eligibleAt: new Date(),
            },
          });

          console.log(
            "🎉 CUSTOMER IS NOW ELIGIBLE (single order threshold met)"
          );

          console.log(
            "Customer ID:",
            customerId
          );

          console.log(
            "Qualifying order amount:",
            orderAmount
          );
        } else if (!existingAmbassador) {
          /*
           * Order didn't meet the threshold — keep the
           * existing eligibility record's state as-is, or
           * create a tracking record at eligible: false.
           * We do NOT accumulate totalSpent across orders
           * here, since eligibility is single-order based.
           */

          await db.ambassadorEligibility.upsert({
            where: {
              shop_customerId: {
                shop,
                customerId,
              },
            },

            update: {
              /*
               * Preserve eligible: true if they already
               * qualified from an earlier order.
               */
              eligible:
                existingEligibility?.eligible || false,
            },

            create: {
              shop,
              customerId,
              totalSpent: orderAmount,
              eligible: false,
              eligibleAt: null,
            },
          });
        }
      } catch (eligibilityError) {
        /*
         * Eligibility failure should NOT stop
         * commission processing.
         */

        console.error(
          "AMBASSADOR ELIGIBILITY ERROR"
        );

        console.error(
          eligibilityError
        );
      }
    }

    /*
     * =====================================================
     * 2. PREVENT DUPLICATE COMMISSION
     * =====================================================
     */

    const existingCommission =
      await db.commission.findUnique({
        where: {
          shop_orderId: {
            shop,
            orderId,
          },
        },
      });

    if (existingCommission) {
      console.log(
        "Commission already exists:",
        existingCommission.id
      );

      return new Response();
    }

    /*
     * =====================================================
     * 3. FIND REFERRAL BY CUSTOMER
     * =====================================================
     */

    let referral = null;

    if (customerId) {
      referral =
        await db.referral.findFirst({
          where: {
            shop,
            referredCustomerId: customerId,
            status: "ACTIVE",
          },

          include: {
            ambassador: true,
          },
        });
    }

    /*
     * =====================================================
     * 4. FALLBACK TO REFERRAL CODE
     * =====================================================
     */

    if (
      !referral &&
      Array.isArray(order.note_attributes)
    ) {
      const referralAttribute =
        order.note_attributes.find(
          (attribute) =>
            attribute.name ===
            "joyshop_referral"
        );

      if (referralAttribute?.value) {
        referral =
          await db.referral.findFirst({
            where: {
              shop,

              ambassador: {
                referralCode:
                  referralAttribute.value,
              },

              status: "ACTIVE",
            },

            include: {
              ambassador: true,
            },
          });
      }
    }

    /*
     * =====================================================
     * 5. NO REFERRAL
     * =====================================================
     */

    if (!referral) {
      console.log(
        "No referral found for this order."
      );

      console.log(
        "========================================"
      );

      return new Response();
    }

    const ambassador =
      referral.ambassador;

    console.log(
      "Referral found:",
      referral.id
    );

    console.log(
      "Ambassador:",
      ambassador.name
    );

    /*
     * =====================================================
     * 6. DETERMINE COMMISSION SLAB RATE
     *
     * Commission is no longer a flat per-order rate. Instead,
     * it's based on the ambassador's TOTAL referred sales for
     * the current calendar month:
     *
     *   Up to ₹30,000        -> 7%
     *   ₹30,001 - ₹60,000    -> 10%
     *   Above ₹60,001        -> 15%
     *
     * The rate is a FLAT rate applied to the entire monthly
     * total (not marginal/bracketed) — e.g. ₹50,000 total in a
     * month pays 10% on the full ₹50,000, not 7% on the first
     * 30k and 10% on the remaining 20k.
     *
     * This recalculates live as each new order comes in: once
     * the monthly total crosses into a new slab, all of that
     * ambassador's still-PENDING commissions for the current
     * month are updated to the new rate. Commissions already
     * APPROVED or PAID are left untouched, since those have
     * already been reviewed/paid out and shouldn't silently
     * change.
     * =====================================================
     */

    function getSlabRate(monthlyTotal) {
      if (monthlyTotal <= 30000) return 7;
      if (monthlyTotal <= 60000) return 10;
      return 15;
    }

    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );

    console.log(
      "Calculating monthly commission slab for period:",
      monthStart.toISOString(),
      "to",
      monthEnd.toISOString()
    );

    /*
     * =====================================================
     * 7. CREATE THIS ORDER'S COMMISSION ROW (placeholder rate)
     *
     * Created first so it's included in the monthly total
     * calculated just below. Its rate/amount get corrected in
     * the recalculation step that follows.
     * =====================================================
     */

    const commission = await db.commission.create({
      data: {
        shop,
        ambassadorId: ambassador.id,
        referralId: referral.id,
        customerId: customerId || referral.referredCustomerId,
        orderId,
        orderAmount,
        commissionRate: 0,
        commissionAmount: 0,
        status: "PENDING",
      },
    });

    /*
     * =====================================================
     * 8. RECALCULATE MONTHLY TOTAL AND APPLY CORRECT SLAB
     * =====================================================
     */

    const monthlyCommissions = await db.commission.findMany({
      where: {
        shop,
        ambassadorId: ambassador.id,
        status: { not: "REJECTED" },
        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    });

    const monthlyTotal = monthlyCommissions.reduce(
      (sum, item) => sum + Number(item.orderAmount || 0),
      0
    );

    const commissionRate = getSlabRate(monthlyTotal);

    console.log(
      "Ambassador monthly referred sales total:",
      monthlyTotal,
      "| Slab rate:",
      commissionRate + "%"
    );

    /*
     * Update every still-PENDING commission for this ambassador
     * in the current month to the new rate — including the one
     * we just created above.
     */
    const pendingThisMonth = monthlyCommissions.filter(
      (item) => item.status === "PENDING"
    );

    for (const item of pendingThisMonth) {
      const recalculatedAmount =
        (Number(item.orderAmount || 0) * commissionRate) / 100;

      await db.commission.update({
        where: { id: item.id },
        data: {
          commissionRate,
          commissionAmount: recalculatedAmount,
        },
      });
    }

    const commissionAmount =
      (orderAmount * commissionRate) / 100;

    console.log(
      "This order's commission:",
      commissionAmount,
      "at",
      commissionRate + "%"
    );

    /*
     * =====================================================
     * 8. UPDATE AMBASSADOR STATISTICS
     * =====================================================
     */

    await db.ambassador.update({
      where: {
        id: ambassador.id,
      },

      data: {
        totalOrders: {
          increment: 1,
        },

        totalEarnings: {
          increment:
            commissionAmount,
        },
      },
    });

    /*
     * =====================================================
     * 9. MARK REFERRAL VISIT CONVERTED
     * =====================================================
     */

    if (customerId) {
      await db.referralVisit.updateMany({
        where: {
          shop,

          referralCode:
            ambassador.referralCode,

          customerId,

          converted: false,
        },

        data: {
          converted: true,
          convertedAt: new Date(),
        },
      });
    } else {
      await db.referralVisit.updateMany({
        where: {
          shop,

          referralCode:
            ambassador.referralCode,

          converted: false,
        },

        data: {
          converted: true,
          convertedAt: new Date(),
        },
      });
    }

    console.log(
      "Commission created:",
      commission.id
    );

    console.log(
      "Commission amount:",
      commissionAmount
    );

    console.log(
      "========================================"
    );

    return new Response();
  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "JOYSHOP ORDER WEBHOOK ERROR"
    );

    console.error(error);

    console.error(
      "========================================"
    );

    /*
     * Keep returning 200 while developing.
     */

    return new Response();
  }
};
