import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return Response.json({ isAmbassador: false });
    }

    const ambassador = await db.ambassador.findFirst({
      where: {
        shop,
        customerId,
        status: "ACTIVE",
      },
    });

    if (!ambassador) {
      return Response.json({ isAmbassador: false });
    }

    return Response.json({
      isAmbassador: true,
      referralCode: ambassador.referralCode,
    });
  } catch (error) {
    console.error("AMBASSADOR STATUS CHECK ERROR:", error);

    return Response.json(
      { isAmbassador: false },
      { status: 500 }
    );
  }
};
