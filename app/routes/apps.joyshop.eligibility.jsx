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
     * The automatic popup only shows a maximum of 5 times
     * total. After that, this endpoint stops returning
     * eligible: true, so popup.js's automatic on-load check
     * stays quiet — but the "Become an Ambassador" button on
     * the account page opens the popup directly, completely
     * independent of this limit, so it's always still
     * reachable manually.
     */

    const POPUP_SHOW_LIMIT = 5;

    if (eligibility.popupShownCount >= POPUP_SHOW_LIMIT) {
      return Response.json({
        eligible: false,
        popupLimitReached: true,
      });
    }

    await db.ambassadorEligibility.update({
      where: {
        shop_customerId: {
          shop,
          customerId,
        },
      },
      data: {
        popupShownCount: {
          increment: 1,
        },
      },
    });

    /*
     * Load the current commission rate so the popup can
     * display the real number instead of a hardcoded value.
     */

    const settings =
      await db.referralSettings.findUnique({
        where: {
          shop,
        },
      });

    const commissionRate =
      settings?.commissionRate ?? 10;

    return Response.json({
      eligible: true,
      totalSpent: eligibility.totalSpent,
      commissionRate,
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
