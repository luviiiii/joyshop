import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Fires when an order is cancelled in Shopify. If the order had a
 * commission:
 *
 * - PENDING: reject it, reverse the ambassador's totals, and
 *   recalculate that ambassador's other PENDING commissions for the
 *   SAME month the cancelled commission belongs to (in IST).
 *
 * - APPROVED / PAID: not changed automatically (money may already
 *   have moved). Logged for manual review.
 *
 * - REJECTED: already handled, nothing to do (safe on retries).
 */

function getSlabRate(monthlyTotal) {
  if (monthlyTotal <= 30000) return 7;
  if (monthlyTotal <= 60000) return 10;
  return 15;
}

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

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    console.log("========================================");
    console.log("JOYSHOP ORDER CANCELLED WEBHOOK");
    console.log("Shop:", shop, "| Topic:", topic);

    const orderId = String(payload?.id || "");

    if (!orderId) {
      console.log("No order ID in payload, ignoring.");
      return new Response();
    }

    const commission = await db.commission.findFirst({
      where: { shop, orderId },
    });

    if (!commission) {
      console.log("No commission for order", orderId, "— nothing to do.");
      return new Response();
    }

    console.log("Commission:", commission.id, "| Status:", commission.status, "| Amount:", commission.commissionAmount);

    if (commission.status === "APPROVED" || commission.status === "PAID") {
      console.log(
        "⚠️  Order cancelled but commission is already",
        commission.status,
        "— needs MANUAL REVIEW in Admin → Commissions.",
        "| Ambassador:",
        commission.ambassadorId
      );
      return new Response();
    }

    if (commission.status !== "PENDING") {
      console.log("Commission already", commission.status, "— nothing to do.");
      return new Response();
    }

    // Recalculate the month this commission was EARNED in, not
    // whatever month it happens to be today.
    const { start: monthStart, end: monthEnd } = istMonthRange(new Date(commission.createdAt));

    const summary = await db.$transaction(
      async (tx) => {
        // Only reject if it's still PENDING (guards against a
        // parallel retry doing this twice).
        const rejected = await tx.commission.updateMany({
          where: { id: commission.id, status: "PENDING" },
          data: { status: "REJECTED" },
        });

        if (rejected.count === 0) {
          return { skipped: true };
        }

        await tx.ambassador.update({
          where: { id: commission.ambassadorId },
          data: {
            totalOrders: { decrement: 1 },
            totalEarnings: { decrement: Number(commission.commissionAmount || 0) },
          },
        });

        const monthlyCommissions = await tx.commission.findMany({
          where: {
            shop,
            ambassadorId: commission.ambassadorId,
            status: { not: "REJECTED" },
            createdAt: { gte: monthStart, lt: monthEnd },
          },
        });

        const monthlyTotal = monthlyCommissions.reduce(
          (sum, item) => sum + Number(item.orderAmount || 0),
          0
        );

        const newRate = getSlabRate(monthlyTotal);

        let earningsDelta = 0;
        let recalculatedCount = 0;

        for (const item of monthlyCommissions) {
          if (item.status !== "PENDING") continue;

          const recalculated = (Number(item.orderAmount || 0) * newRate) / 100;

          await tx.commission.update({
            where: { id: item.id },
            data: { commissionRate: newRate, commissionAmount: recalculated },
          });

          earningsDelta += recalculated - Number(item.commissionAmount || 0);
          recalculatedCount++;
        }

        if (earningsDelta !== 0) {
          await tx.ambassador.update({
            where: { id: commission.ambassadorId },
            data: { totalEarnings: { increment: earningsDelta } },
          });
        }

        return { skipped: false, monthlyTotal, newRate, recalculatedCount };
      },
      { timeout: 20000 }
    );

    if (summary.skipped) {
      console.log("Already rejected by a parallel delivery — done.");
    } else {
      console.log(
        "Commission rejected. Month total now:",
        summary.monthlyTotal,
        "| New rate:",
        summary.newRate + "%",
        "| Recalculated",
        summary.recalculatedCount,
        "pending commission(s)."
      );
    }

    console.log("========================================");
    return new Response();
  } catch (error) {
    console.error("ORDER CANCELLED WEBHOOK ERROR — Shopify will retry:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
};
