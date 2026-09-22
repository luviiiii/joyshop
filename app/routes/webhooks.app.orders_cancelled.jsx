import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Fires when an order is cancelled in Shopify. If that order
 * had a commission attached (i.e. it came from a referred
 * customer), this handler:
 *
 * - If the commission is still PENDING (not yet approved or
 *   paid out): rejects it, then recalculates the ambassador's
 *   other still-PENDING commissions for the month at the
 *   corrected slab rate now that this order no longer counts
 *   toward their monthly total.
 *
 * - If the commission is already APPROVED or PAID: does NOT
 *   auto-modify it, since real money may already have moved.
 *   Logs a clear warning for manual review instead.
 */

function getSlabRate(monthlyTotal) {
  if (monthlyTotal <= 30000) return 7;
  if (monthlyTotal <= 60000) return 10;
  return 15;
}

export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);

    console.log("========================================");
    console.log("JOYSHOP ORDER CANCELLED WEBHOOK");
    console.log("Shop:", shop);
    console.log("Topic:", topic);

    const orderId = String(payload?.id || "");

    if (!orderId) {
      console.log("No order ID in payload, ignoring.");
      console.log("========================================");
      return new Response();
    }

    console.log("Cancelled Order ID:", orderId);

    const commission = await db.commission.findFirst({
      where: {
        shop,
        orderId,
      },
    });

    if (!commission) {
      console.log(
        "No commission found for this order (not a referred order) — nothing to do."
      );
      console.log("========================================");
      return new Response();
    }

    console.log("Found commission:", commission.id);
    console.log("Commission status:", commission.status);
    console.log("Commission amount:", commission.commissionAmount);

    /*
     * =====================================================
     * ALREADY APPROVED OR PAID — DO NOT AUTO-MODIFY.
     * Flag clearly for manual review instead.
     * =====================================================
     */

    if (commission.status === "APPROVED" || commission.status === "PAID") {
      console.log(
        "⚠️  WARNING: This order was cancelled, but its commission is already",
        commission.status,
        "— this needs MANUAL REVIEW in Admin → Commissions."
      );
      console.log("Commission ID:", commission.id);
      console.log("Ambassador ID:", commission.ambassadorId);
      console.log("Amount:", commission.commissionAmount);
      console.log("========================================");
      return new Response();
    }

    /*
     * =====================================================
     * STILL PENDING — reject it and recalculate the
     * ambassador's other pending commissions this month.
     * =====================================================
     */

    if (commission.status === "PENDING") {
      await db.commission.update({
        where: { id: commission.id },
        data: { status: "REJECTED" },
      });

      console.log(
        "Commission rejected due to order cancellation:",
        commission.id
      );

      /*
       * This commission's amount was already added to the
       * ambassador's totalEarnings/totalOrders when the order
       * was originally paid — reverse that now that it's
       * cancelled, so the ambassador's stored totals stay
       * accurate.
       */
      await db.ambassador.update({
        where: { id: commission.ambassadorId },
        data: {
          totalOrders: {
            decrement: 1,
          },
          totalEarnings: {
            decrement: Number(commission.commissionAmount || 0),
          },
        },
      });

      console.log(
        "Ambassador totals corrected: -1 order, -",
        commission.commissionAmount,
        "earnings"
      );

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

      const monthlyCommissions = await db.commission.findMany({
        where: {
          shop,
          ambassadorId: commission.ambassadorId,
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

      const newCommissionRate = getSlabRate(monthlyTotal);

      console.log(
        "Ambassador's corrected monthly total after cancellation:",
        monthlyTotal,
        "| New slab rate:",
        newCommissionRate + "%"
      );

      const pendingThisMonth = monthlyCommissions.filter(
        (item) => item.status === "PENDING"
      );

      for (const item of pendingThisMonth) {
        const oldAmount = Number(item.commissionAmount || 0);

        const recalculatedAmount =
          (Number(item.orderAmount || 0) * newCommissionRate) / 100;

        await db.commission.update({
          where: { id: item.id },
          data: {
            commissionRate: newCommissionRate,
            commissionAmount: recalculatedAmount,
          },
        });

        const delta = recalculatedAmount - oldAmount;

        if (delta !== 0) {
          await db.ambassador.update({
            where: { id: commission.ambassadorId },
            data: {
              totalEarnings: {
                increment: delta,
              },
            },
          });
        }
      }

      console.log(
        "Recalculated",
        pendingThisMonth.length,
        "remaining pending commission(s) for this ambassador."
      );
    }

    console.log("========================================");

    return new Response();
  } catch (error) {
    console.error("ORDER CANCELLED WEBHOOK ERROR:", error);
    return new Response();
  }
};
