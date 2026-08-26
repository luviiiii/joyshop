import { authenticate } from "../shopify.server";
import db from "../db.server";

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function loader({ request }) {
  console.log("========================================");
  console.log("JOYSHOP REFERRAL TRACK REQUEST");
  console.log("URL:", request.url);

  try {
    // --------------------------------------------------
    // 1. Get referral code
    // --------------------------------------------------

    const url = new URL(request.url);

    const referralCode = url.searchParams.get("ref");

    console.log("Referral Code:", referralCode);

    if (!referralCode) {
      return jsonResponse(
        {
          success: false,
          error: "Missing referral code",
        },
        400
      );
    }

    // --------------------------------------------------
    // 2. Authenticate Shopify App Proxy
    // --------------------------------------------------

    console.log("Authenticating App Proxy...");

    await authenticate.public.appProxy(request);

    // Shopify adds this when a customer is logged in.
    const loggedInCustomerId =
      url.searchParams.get("logged_in_customer_id");

    console.log(
      "Logged-in Shopify Customer ID:",
      loggedInCustomerId || "NOT LOGGED IN"
    );

    // Shopify also gives us the shop.
    const shop = url.searchParams.get("shop");

    console.log("Shop:", shop);

    if (!shop) {
      return jsonResponse(
        {
          success: false,
          error: "Shop not found",
        },
        400
      );
    }

    // --------------------------------------------------
    // 3. Find Ambassador
    // --------------------------------------------------

    console.log("Searching for ambassador...");

    const ambassador = await db.ambassador.findFirst({
      where: {
        shop,
        referralCode,
        status: "ACTIVE",
      },
    });

    if (!ambassador) {
      console.log(
        "AMBASSADOR NOT FOUND:",
        referralCode
      );

      return jsonResponse(
        {
          success: false,
          error: "Invalid referral code",
          referralCode,
        },
        404
      );
    }

    console.log(
      "AMBASSADOR FOUND:",
      ambassador.name
    );

    console.log(
      "Ambassador ID:",
      ambassador.id
    );

    // --------------------------------------------------
    // 4. Visitor information
    // --------------------------------------------------

    const userAgent =
      request.headers.get("user-agent") || null;

    const forwardedFor =
      request.headers.get("x-forwarded-for");

    const realIp =
      request.headers.get("x-real-ip");

    const ipAddress =
      forwardedFor?.split(",")[0]?.trim() ||
      realIp ||
      null;

    const visitorId = crypto.randomUUID();

    console.log("Visitor ID:", visitorId);
    console.log("IP Address:", ipAddress);
    console.log("User Agent:", userAgent);

    // --------------------------------------------------
    // 5. Save Referral Visit
    // --------------------------------------------------

    const visit = await db.referralVisit.create({
      data: {
        shop,
        referralCode,
        visitorId,
        ipAddress,
        userAgent,

        // IMPORTANT:
        // Save the actual Shopify customer ID
        // if the customer is logged in.
        customerId: loggedInCustomerId || null,

        converted: false,
      },
    });

    console.log(
      "REFERRAL VISIT CREATED:",
      visit.id
    );

    // --------------------------------------------------
    // 6. If customer is already logged in,
    //    create/update the Referral immediately.
    // --------------------------------------------------

    let referral = null;

    if (loggedInCustomerId) {
      console.log(
        "Customer is logged in. Checking referral..."
      );

      referral = await db.referral.findFirst({
        where: {
          shop,
          referredCustomerId: loggedInCustomerId,
        },
      });

      if (!referral) {
        console.log(
          "Creating referral for Shopify customer:",
          loggedInCustomerId
        );

        referral = await db.referral.create({
          data: {
            shop,
            ambassadorId: ambassador.id,
            referredCustomerId: loggedInCustomerId,
            referredName: null,
            referredEmail: null,
            status: "ACTIVE",
          },
        });

        console.log(
          "REFERRAL CREATED:",
          referral.id
        );
      } else {
        console.log(
          "Referral already exists:",
          referral.id
        );
      }
    }

    console.log("========================================");

    // --------------------------------------------------
    // 7. Return success
    // --------------------------------------------------

    return jsonResponse({
      success: true,
      tracked: true,

      referralCode,

      visitId: visit.id,

      customerId:
        loggedInCustomerId || null,

      referralId:
        referral?.id || null,
    });
  } catch (error) {
    console.error("========================================");
    console.error("REFERRAL TRACKING ERROR");
    console.error("========================================");

    console.error(error);

    console.error(
      "Error message:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    console.error("========================================");

    return jsonResponse(
      {
        success: false,
        error: "Internal server error",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}