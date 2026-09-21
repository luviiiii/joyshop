import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "JOYSHOP <care@justorganik.com>";

/*
 * The ONE shared discount code you create manually in Shopify
 * Admin (Discounts -> Create discount), scoped to a Customer
 * Segment matching REFERRED_CUSTOMER_TAG below. This avoids
 * generating a unique code per referral, since discount code
 * creation is capped (e.g. 25 total on some plans).
 */
const WELCOME_DISCOUNT_CODE = "WELCOME200";
const REFERRED_CUSTOMER_TAG = "joyshop-referred";
const MINIMUM_ORDER_VALUE = 1500;

/*
 * Retries a database operation on transient connection failures
 * (Prisma P1001 - "Can't reach database server"). This can
 * happen briefly under load or cross-provider network blips.
 * Retries up to 2 extra times with a short delay before giving
 * up, so a momentary hiccup doesn't cost a real referral.
 */
async function withRetry(fn, retries = 2, delayMs = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isConnectionError = error?.code === "P1001";
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

function customerGid(customerId) {
  if (!customerId) return null;

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

/*
 * Tags the customer so they match the Customer Segment your
 * shared discount code is scoped to. Tagging has no practical
 * limit, unlike discount code creation.
 */
async function tagCustomerAsReferred(admin, customerId) {
  const response = await admin.graphql(
    `#graphql
    mutation TagCustomer($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          id
        }
        userErrors {
          field
          message
        }
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
      "Tagging customer failed: " +
        userErrors.map((e) => e.message).join(", ")
    );
  }

  return true;
}

async function sendWelcomeCreditEmail(
  customerEmail,
  firstName,
  amount,
  minimumOrderValue
) {
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
            Apply this code at checkout. Valid for one use only, on
            your first qualifying order.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("WELCOME CREDIT EMAIL ERROR:", error);
    // Don't let an email failure block referral tracking.
  }
}

export const loader = async ({ request }) => {
  console.log("========================================");
  console.log("JOYSHOP REFERRAL TRACK REQUEST");
  console.log("URL:", request.url);

  try {
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

    console.log("Authenticating App Proxy...");

    const { admin } = await authenticate.public.appProxy(request);

    const loggedInCustomerId =
      url.searchParams.get("logged_in_customer_id");

    console.log(
      "Logged-in Shopify Customer ID:",
      loggedInCustomerId || "NOT LOGGED IN"
    );

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

    console.log("Searching for ambassador...");

    const ambassador = await db.ambassador.findFirst({
      where: {
        shop,
        referralCode,
        status: "ACTIVE",
      },
    });

    if (!ambassador) {
      console.log("AMBASSADOR NOT FOUND:", referralCode);

      return jsonResponse(
        {
          success: false,
          error: "Invalid referral code",
          referralCode,
        },
        404
      );
    }

    console.log("AMBASSADOR FOUND:", ambassador.name);
    console.log("Ambassador ID:", ambassador.id);

    const userAgent = request.headers.get("user-agent") || null;

    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");

    const ipAddress =
      forwardedFor?.split(",")[0]?.trim() || realIp || null;

    const visitorId = crypto.randomUUID();

    console.log("Visitor ID:", visitorId);
    console.log("IP Address:", ipAddress);
    console.log("User Agent:", userAgent);

    const visit = await db.referralVisit.create({
      data: {
        shop,
        referralCode,
        visitorId,
        ipAddress,
        userAgent,
        customerId: loggedInCustomerId || null,
        converted: false,
      },
    });

    console.log("REFERRAL VISIT CREATED:", visit.id);

    let referral = null;

    if (loggedInCustomerId) {
      console.log("Customer is logged in. Checking referral...");

      referral = await db.referral.findFirst({
        where: {
          shop,
          referredCustomerId: loggedInCustomerId,
        },
      });

      if (!referral) {
        console.log(
          "No existing referral for this customer. Checking if they are a genuinely new signup..."
        );

        let referredName = null;
        let referredEmail = null;

        /*
         * Definitive check: was this exact customerId recorded
         * by our customers/create webhook? If Shopify never
         * fired that webhook for them, they already had an
         * account before clicking this referral link.
         */
        const newAccountRecord = await withRetry(() =>
          db.newCustomerAccount.findFirst({
            where: {
              shop,
              customerId: loggedInCustomerId,
            },
          })
        );

        const isGenuinelyNewCustomer = Boolean(newAccountRecord);

        console.log(
          "customers/create webhook record found:",
          isGenuinelyNewCustomer
        );

        if (!isGenuinelyNewCustomer) {
          console.log(
            "Customer already had an account before this click — skipping referral creation, tagging, and welcome credit."
          );

          console.log("========================================");

          return jsonResponse({
            success: true,
            tracked: true,
            referralCode,
            visitId: visit.id,
            customerId: loggedInCustomerId,
            referralId: null,
            skippedReason: "existing_customer",
          });
        }

        let referredPhone = null;

        try {
          const customerResponse = await admin.graphql(
            `#graphql
            query GetCustomer($id: ID!) {
              customer(id: $id) {
                email
                firstName
                lastName
                phone
              }
            }`,
            {
              variables: {
                id: customerGid(loggedInCustomerId),
              },
            }
          );

          const customerResult = await customerResponse.json();
          const customer = customerResult?.data?.customer;

          if (customer) {
            referredName =
              [customer.firstName, customer.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || null;

            referredEmail = customer.email || null;
            referredPhone = customer.phone || null;
          }
        } catch (nameError) {
          console.error(
            "Failed to fetch customer name for referral:",
            nameError
          );
          // Fall back to null name/email/phone — not a fatal
          // error, we already confirmed they're a genuine new
          // signup.
        }

        console.log(
          "Creating referral for Shopify customer:",
          loggedInCustomerId
        );

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

        console.log("REFERRAL CREATED:", referral.id);

        /*
         * =====================================================
         * TAG CUSTOMER + SEND WELCOME CODE
         *
         * Instead of creating a unique discount code per
         * referral (limited to 25 total codes on some plans),
         * we tag the customer so they match the Customer
         * Segment your ONE shared "WELCOME200" discount code
         * is scoped to in Shopify Admin.
         * =====================================================
         */

        try {
          const settings = await db.referralSettings.findUnique({
            where: { shop },
          });

          const creditEnabled =
            settings?.firstOrderCreditEnabled ?? true;

          const creditAmount = Number(
            settings?.firstOrderCredit ?? 200
          );

          if (creditEnabled && admin) {
            await tagCustomerAsReferred(admin, loggedInCustomerId);

            console.log(
              "Customer tagged as referred:",
              loggedInCustomerId
            );

            await db.referralCredit.create({
              data: {
                shop,
                customerId: loggedInCustomerId,
                referralId: referral.id,
                amount: creditAmount,
                discountCode: WELCOME_DISCOUNT_CODE,
                status: "ISSUED",
                expiresAt: settings?.creditExpiryDays
                  ? new Date(
                      Date.now() +
                        settings.creditExpiryDays *
                          24 *
                          60 *
                          60 *
                          1000
                    )
                  : null,
              },
            });

            if (referredEmail) {
              await sendWelcomeCreditEmail(
                referredEmail,
                referredName,
                creditAmount,
                MINIMUM_ORDER_VALUE
              );
            }
          }
        } catch (creditError) {
          /*
           * A tagging/email failure should NOT stop referral
           * tracking from succeeding.
           */
          console.error("WELCOME CREDIT TAGGING ERROR:");
          console.error(creditError);
        }
      } else {
        console.log("Referral already exists:", referral.id);
      }
    }

    console.log("========================================");

    return jsonResponse({
      success: true,
      tracked: true,
      referralCode,
      visitId: visit.id,
      customerId: loggedInCustomerId || null,
      referralId: referral?.id || null,
    });
  } catch (error) {
    console.error("========================================");
    console.error("REFERRAL TRACKING ERROR");
    console.error("========================================");
    console.error(error);
    console.error(
      "Error message:",
      error instanceof Error ? error.message : String(error)
    );
    console.error("========================================");

    return jsonResponse(
      {
        success: false,
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};
