import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Read-only eligibility check for showing a persistent
 * "Become an Ambassador" button on the account page.
 */
export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    console.log("BECOME-AMBASSADOR-STATUS CHECK:", { shop, customerId });

    if (!shop || !customerId) {
      console.log("BECOME-AMBASSADOR-STATUS: missing shop or customerId");
      return Response.json({ showButton: false });
    }

    const eligibility = await db.ambassadorEligibility.findFirst({
      where: {
        shop,
        customerId,
        eligible: true,
      },
    });

    console.log(
      "BECOME-AMBASSADOR-STATUS eligibility result:",
      JSON.stringify(eligibility)
    );

    // Also fetch ALL eligibility rows for this customer, regardless
    // of shop/eligible filter, to spot mismatches.
    const allEligibilityRows = await db.ambassadorEligibility.findMany({
      where: { customerId },
    });

    console.log(
      "BECOME-AMBASSADOR-STATUS all eligibility rows for this customerId:",
      JSON.stringify(allEligibilityRows)
    );

    if (!eligibility) {
      return Response.json({ showButton: false });
    }

    const existingAmbassador = await db.ambassador.findFirst({
      where: { shop, customerId },
    });

    console.log(
      "BECOME-AMBASSADOR-STATUS existingAmbassador:",
      JSON.stringify(existingAmbassador)
    );

    if (existingAmbassador) {
      return Response.json({ showButton: false });
    }

    const existingApplication = await db.ambassadorApplication.findFirst({
      where: { shop, customerId },
    });

    console.log(
      "BECOME-AMBASSADOR-STATUS existingApplication:",
      JSON.stringify(existingApplication)
    );

    if (existingApplication && existingApplication.status === "PENDING") {
      return Response.json({ showButton: false });
    }

    if (existingApplication && existingApplication.status === "APPROVED") {
      return Response.json({ showButton: false });
    }

    console.log("BECOME-AMBASSADOR-STATUS: showing button = true");

    return Response.json({ showButton: true });
  } catch (error) {
    console.error("BECOME AMBASSADOR STATUS CHECK ERROR:", error);

    return Response.json({ showButton: false }, { status: 500 });
  }
};
