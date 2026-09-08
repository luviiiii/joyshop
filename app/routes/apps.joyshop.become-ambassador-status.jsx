import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Read-only eligibility check for showing a persistent
 * "Become an Ambassador" button on the account page. Also
 * reports whether the customer already clicked "I'm
 * Interested" on the popup, so the button can skip straight
 * to the application form instead of showing the popup again.
 */
export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return Response.json({ showButton: false, alreadyInterested: false });
    }

    const eligibility = await db.ambassadorEligibility.findFirst({
      where: {
        shop,
        customerId,
        eligible: true,
      },
    });

    if (!eligibility) {
      return Response.json({ showButton: false, alreadyInterested: false });
    }

    const alreadyInterested = Boolean(eligibility.interestedAt);

    const existingAmbassador = await db.ambassador.findFirst({
      where: { shop, customerId },
    });

    if (existingAmbassador) {
      return Response.json({ showButton: false, alreadyInterested });
    }

    const existingApplication = await db.ambassadorApplication.findFirst({
      where: { shop, customerId },
    });

    if (existingApplication && existingApplication.status === "PENDING") {
      return Response.json({ showButton: false, alreadyInterested });
    }

    if (existingApplication && existingApplication.status === "APPROVED") {
      return Response.json({ showButton: false, alreadyInterested });
    }

    return Response.json({ showButton: true, alreadyInterested });
  } catch (error) {
    console.error("BECOME AMBASSADOR STATUS CHECK ERROR:", error);

    return Response.json(
      { showButton: false, alreadyInterested: false },
      { status: 500 }
    );
  }
};
