import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Read-only eligibility check for showing a persistent
 * "Become an Ambassador" button on the account page — for
 * customers who are eligible but dismissed the popup, missed
 * it, or just haven't applied yet.
 *
 * Unlike apps.joyshop.eligibility.jsx, this does NOT mark
 * notifiedAt, so it has no effect on the one-time popup logic.
 */
export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return Response.json({ showButton: false });
    }

    const eligibility = await db.ambassadorEligibility.findFirst({
      where: {
        shop,
        customerId,
        eligible: true,
      },
    });

    if (!eligibility) {
      return Response.json({ showButton: false });
    }

    const existingAmbassador = await db.ambassador.findFirst({
      where: {
        shop,
        customerId,
      },
    });

    if (existingAmbassador) {
      // Already an ambassador — the dashboard button covers this.
      return Response.json({ showButton: false });
    }

    const existingApplication = await db.ambassadorApplication.findFirst({
      where: {
        shop,
        customerId,
      },
    });

    if (existingApplication && existingApplication.status === "PENDING") {
      // Already applied, waiting on review — don't prompt again.
      return Response.json({ showButton: false });
    }

    if (existingApplication && existingApplication.status === "APPROVED") {
      // Should already be an Ambassador record in this case, but
      // just in case of a data inconsistency, don't show the button.
      return Response.json({ showButton: false });
    }

    // Eligible, not an ambassador, no pending/approved application
    // (a REJECTED application is fine — let them reapply).
    return Response.json({ showButton: true });
  } catch (error) {
    console.error("BECOME AMBASSADOR STATUS CHECK ERROR:", error);

    return Response.json({ showButton: false }, { status: 500 });
  }
};
