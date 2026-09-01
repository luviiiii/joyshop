import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop =
      url.searchParams.get("shop");

    const customerId =
      url.searchParams.get(
        "logged_in_customer_id"
      );

    /*
     * Customer isn't logged in.
     */

    if (!shop || !customerId) {
      return Response.json({
        eligible: false,
      });
    }

    /*
     * Check if already an ambassador.
     */

    const ambassador =
      await db.ambassador.findFirst({
        where: {
          shop,
          customerId,
        },
      });

    if (ambassador) {
      return Response.json({
        eligible: false,
        alreadyAmbassador: true,
      });
    }

    /*
     * Find eligibility record.
     */

    const eligibility =
      await db.ambassadorEligibility.findUnique({
        where: {
          shop_customerId: {
            shop,
            customerId,
          },
        },
      });

    if (
      !eligibility ||
      !eligibility.eligible
    ) {
      return Response.json({
        eligible: false,
      });
    }

    /*
     * Only show popup once.
     */

    if (eligibility.notifiedAt) {
      return Response.json({
        eligible: false,
        alreadyNotified: true,
      });
    }

    /*
     * Mark notification as shown.
     */

    await db.ambassadorEligibility.update({
      where: {
        id: eligibility.id,
      },

      data: {
        notifiedAt: new Date(),
      },
    });

    return Response.json({
      eligible: true,
      totalSpent: eligibility.totalSpent,
    });
  } catch (error) {
    console.error(
      "Eligibility proxy error:",
      error
    );

    return Response.json(
      {
        eligible: false,
      },
      {
        status: 500,
      }
    );
  }
};