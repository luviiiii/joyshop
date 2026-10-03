import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "JOYSHOP <care@justorganik.com>";

/*
 * The ONE shared discount code you created manually in Shopify
 * Admin, scoped to a Customer Segment matching
 * REFERRED_CUSTOMER_TAG below.
 */
const WELCOME_DISCOUNT_CODE = "WELCOME200";
const REFERRED_CUSTOMER_TAG = "joyshop-referred";
const MINIMUM_ORDER_VALUE = 1500;

/*
 * The customers/create webhook can arrive a few seconds AFTER
 * the browser calls this endpoint. So a customer also counts as
 * brand new if Shopify says their account was created within
 * this window and they have no orders yet.
 */
const NEW_CUSTOMER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/*
 * Retries a database operation on transient connection failures
 * (P1001 can't reach server, P1017 server closed connection).
 */
async function withRetry(fn, retries = 2, delayMs = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isConnectionError =
        error?.code === "P1001" || error?.code === "P1017";
      const isLastAttempt = attempt === retries;

      if (!isConnectionError || isLastAttempt) {
        throw error;
      }

      console.log(
        `Database connection blip, retrying (attempt ${attempt + 1}/${retries})...`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function customerGid(customerId) {
  if (!customerId) return null;

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

async function tagCustomerAsReferred(admin, customerId) {
  const response = await admin.graphql(
    `#graphql
    mutation TagCustomer($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: customerGid(customerId),
        tags: [REFERRED_CUSTOMER_TAG],
      },
    }
  );

  const result = await response.json();
  const userErrors = result?.data?.tagsAdd?.userErrors;

  if (userErrors && userErrors.length) {
    throw new Error(
      "Tagging customer failed: " + userErrors.map((e) => e.message).join(", ")
    );
  }

  return true;
}

async function fetchCustomer(admin, customerId) {
  const response = await admin.graphql(
    `#graphql
    query GetCustomer($id: ID!) {
      customer(id: $id) {
        email
        firstName
        lastName
        phone
        createdAt
        numberOfOrders
      }
    }`,
    { variables: { id: customerGid(customerId) } }
  );

  const result = await response.json();
  return result?.data?.customer || null;
}

async function sendWelcomeCreditEmail(customerEmail, firstName, amount, minimumOrderValue) {
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: `Here's ₹${amount} off your first order!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2d22;">
          <h2 style="color: #14532d;">Hi ${firstName || "there"},</h2>
          <p>
            Welcome to Just Organik! As a thank-you for joining through
            a friend's referral, here's ₹${amount} off your first order
            of ₹${minimumOrderValue} or more.
          </p>
          <p style="text-align: center; margin: 32px 0;">
            <span style="display: inline-block; background: #f5faf6; border: 2px dashed #14532d; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 18px; letter-spacing: 1px; color: #14532d;">
              ${WELCOME_DISCOUNT_CODE}
            </span>
          </p>
          <p style="font-size: 13px; color: #6b7a70;">
            Apply this code at checkout while logged in to your account.
            Valid for one use only, on your first qualifying order.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("WELCOME CREDIT EMAIL ERROR:", error);
  }
}

export const loader = async ({ request }) => {
  console.log("========================================");
  console.log("JOYSHOP REFERRAL TRACK REQUEST");

  try {
    const url = new URL(request.url);
    const referralCode = url.searchParams.get("ref");

    // Only the first landing on ?ref= logs a visit. Repeat / polling
    // calls just try to link, so the visits table stays accurate.
    const shouldLogVisit = url.searchParams.get("visit") === "1";

    console.log("Referral Code:", referralCode, "| log visit:", shouldLogVisit);

    if (!referralCode) {
      return jsonResponse({ success: false, error: "Missing referral code" }, 400);
    }

    const { admin } = await authenticate.public.appProxy(request);

    const loggedInCustomerId = url.searchParams.get("logged_in_customer_id") || null;
    const shop = url.searchParams.get("shop");

    console.log("Shop:", shop, "| Customer:", loggedInCustomerId || "NOT LOGGED IN");

    if (!shop) {
      return jsonResponse({ success: false, error: "Shop not found" }, 400);
    }

    const ambassador = await withRetry(() =>
      db.ambassador.findFirst({
        where: { shop, referralCode, status: "ACTIVE" },
      })
    );

    if (!ambassador) {
      console.log("AMBASSADOR NOT FOUND / INACTIVE:", referralCode);
      return jsonResponse(
        { success: false, error: "Invalid referral code", referralCode },
        404
      );
    }

    console.log("AMBASSADOR FOUND:", ambassador.name);

    /* ---------- 1. Log the visit (first landing only) ---------- */

    let visitId = null;

    if (shouldLogVisit) {
      const forwardedFor = request.headers.get("x-forwarded-for");
      const realIp = request.headers.get("x-real-ip");

      const visit = await withRetry(() =>
        db.referralVisit.create({
          data: {
            shop,
            referralCode,
            visitorId: crypto.randomUUID(),
            ipAddress: forwardedFor?.split(",")[0]?.trim() || realIp || null,
            userAgent: request.headers.get("user-agent") || null,
            customerId: loggedInCustomerId,
            converted: false,
          },
        })
      );

      visitId = visit.id;
      console.log("REFERRAL VISIT CREATED:", visitId);
    }

    const base = { success: true, tracked: true, referralCode, visitId };

    /* ---------- 2. Not logged in: nothing to link yet ---------- */

    if (!loggedInCustomerId) {
      console.log("Visitor not logged in — visit only.");
      console.log("========================================");
      return jsonResponse({ ...base, customerId: null, referralId: null });
    }

    /* ---------- 3. Self-referral ---------- */

    if (String(ambassador.customerId).split("/").pop() === loggedInCustomerId) {
      console.log("Ambassador used their own link — ignored.");
      console.log("========================================");
      return jsonResponse({
        ...base,
        customerId: loggedInCustomerId,
        referralId: null,
        skippedReason: "self_referral",
      });
    }

    /* ---------- 4. Already referred? ---------- */

    const existingReferral = await withRetry(() =>
      db.referral.findFirst({
        where: { shop, referredCustomerId: loggedInCustomerId },
      })
    );

    if (existingReferral) {
      console.log("Referral already exists:", existingReferral.id);
      console.log("========================================");
      return jsonResponse({
        ...base,
        customerId: loggedInCustomerId,
        referralId: existingReferral.id,
        isNewReferral: false,
      });
    }

    /* ---------- 5. Is this a genuinely new customer? ---------- */

    const newAccountRecord = await withRetry(() =>
      db.newCustomerAccount.findFirst({
        where: { shop, customerId: loggedInCustomerId },
      })
    );

    let customer = null;

    try {
      customer = admin ? await fetchCustomer(admin, loggedInCustomerId) : null;
    } catch (lookupError) {
      console.error("Customer lookup failed:", lookupError);
    }

    const createdAt = customer?.createdAt ? new Date(customer.createdAt).getTime() : null;
    const orderCount = Number(customer?.numberOfOrders || 0);

    const createdRecently =
      createdAt !== null && Date.now() - createdAt <= NEW_CUSTOMER_WINDOW_MS;

    const isGenuinelyNewCustomer =
      Boolean(newAccountRecord) || (createdRecently && orderCount === 0);

    console.log(
      "New-customer check → webhook record:",
      Boolean(newAccountRecord),
      "| created recently:",
      createdRecently,
      "| orders:",
      orderCount
    );

    // We couldn't verify either way (no webhook record AND Shopify
    // lookup failed). Tell the browser to try again later instead of
    // wrongly treating them as an existing customer forever.
    if (!newAccountRecord && !customer) {
      console.log("Could not verify customer — asking browser to retry.");
      console.log("========================================");
      return jsonResponse(
        { success: false, retry: true, error: "Could not verify customer yet" },
        503
      );
    }

    if (!isGenuinelyNewCustomer) {
      console.log("Existing customer — no referral, tag or welcome credit.");
      console.log("========================================");
      return jsonResponse({
        ...base,
        customerId: loggedInCustomerId,
        referralId: null,
        skippedReason: "existing_customer",
      });
    }

    /* ---------- 6. Create the referral ---------- */

    const referredName =
      [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() || null;
    const referredEmail = customer?.email || null;
    const referredPhone = customer?.phone || null;

    let referral = null;
    let created = false;

    try {
      referral = await withRetry(() =>
        db.referral.create({
          data: {
            shop,
            ambassadorId: ambassador.id,
            referredCustomerId: loggedInCustomerId,
            referredName,
            referredEmail,
            referredPhone,
            status: "ACTIVE",
          },
        })
      );
      created = true;
      console.log("REFERRAL CREATED:", referral.id);
    } catch (createError) {
      // Two tabs / calls raced each other — the other one won.
      if (createError?.code === "P2002") {
        referral = await db.referral.findFirst({
          where: { shop, referredCustomerId: loggedInCustomerId },
        });
        console.log("Referral was created by a parallel request:", referral?.id);
      } else {
        throw createError;
      }
    }

    /* ---------- 7. Welcome benefit (only for the call that created it) ---------- */

    if (created) {
      if (admin) {
        try {
          await tagCustomerAsReferred(admin, loggedInCustomerId);
          console.log("Customer tagged as referred:", loggedInCustomerId);
        } catch (tagError) {
          console.error("CUSTOMER TAGGING ERROR:", tagError);
        }
      }

      try {
        const settings = await db.referralSettings.findUnique({ where: { shop } });

        const creditEnabled = settings?.firstOrderCreditEnabled ?? true;
        const creditAmount = Number(settings?.firstOrderCredit ?? 200);

        if (creditEnabled) {
          await db.referralCredit.create({
            data: {
              shop,
              customerId: loggedInCustomerId,
              referralId: referral.id,
              amount: creditAmount,
              discountCode: WELCOME_DISCOUNT_CODE,
              status: "ISSUED",
              expiresAt: settings?.creditExpiryDays
                ? new Date(Date.now() + settings.creditExpiryDays * 24 * 60 * 60 * 1000)
                : null,
            },
          });

          if (referredEmail) {
            await sendWelcomeCreditEmail(
              referredEmail,
              customer?.firstName,
              creditAmount,
              MINIMUM_ORDER_VALUE
            );
          }
        }
      } catch (creditError) {
        console.error("WELCOME CREDIT ERROR:", creditError);
      }
    }

    console.log("========================================");

    return jsonResponse({
      ...base,
      customerId: loggedInCustomerId,
      referralId: referral?.id || null,
      isNewReferral: created,
    });
  } catch (error) {
    console.error("========================================");
    console.error("REFERRAL TRACKING ERROR");
    console.error(error);
    console.error("========================================");

    return jsonResponse(
      {
        success: false,
        retry: true,
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};
