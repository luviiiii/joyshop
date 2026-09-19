import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "JOYSHOP Ambassador Program <ambassador@justorganik.com>";

const STOREFRONT_DOMAIN = "https://www.justorganik.com";

function customerGid(customerId) {
  const value = String(customerId);

  if (
    value.startsWith(
      "gid://shopify/Customer/"
    )
  ) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

function createReferralCode(name) {
  const cleanName =
    String(name || "AMBASSADOR")
      .replace(
        /[^a-zA-Z0-9]/g,
        ""
      )
      .toUpperCase()
      .slice(0, 8) ||
    "AMBASSADOR";

  const randomPart =
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

  return `${cleanName}-${randomPart}`;
}

/*
 * =====================================================
 * WELCOME EMAIL CONTENT
 *
 * Edit the subject and HTML below to change what new
 * ambassadors receive. {{name}}, {{referralCode}}, and
 * {{referralLink}} get replaced automatically.
 * =====================================================
 */

function buildWelcomeEmail({ name, referralCode, referralLink }) {
  const subject = `Welcome to the JOYSHOP Ambassador Program, ${name}!`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2d22;">
      <h2 style="color: #14532d;">Hi ${name},</h2>

      <p>
        You're officially a Just Organik Ambassador! Start sharing
        your referral link below to earn commission on every order
        your friends place.
      </p>

      <p style="text-align: center; margin: 28px 0;">
        <span style="display: inline-block; background: #f5faf6; border: 2px dashed #14532d; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 16px; letter-spacing: 0.5px; color: #14532d; word-break: break-all;">
          ${referralLink}
        </span>
      </p>

      <p>
        Your referral code: <strong>${referralCode}</strong>
      </p>

      <p style="font-size: 13px; color: #6b7a70;">
        Log in to your account anytime to view your full ambassador
        dashboard, track referrals, and see your earnings.
      </p>
    </div>
  `;

  return { subject, html };
}

async function sendWelcomeEmail(email, name, referralCode) {
  try {
    const referralLink = `${STOREFRONT_DOMAIN}/?ref=${encodeURIComponent(referralCode)}`;

    const { subject, html } = buildWelcomeEmail({
      name,
      referralCode,
      referralLink,
    });

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject,
      html,
    });
  } catch (error) {
    console.error("AMBASSADOR WELCOME EMAIL ERROR:", error);
    // Don't let an email failure block ambassador creation.
  }
}

export const action = async ({ request }) => {
  try {
    const {
      admin,
    } = await authenticate.public.appProxy(
      request
    );

    const url = new URL(request.url);

    const shop =
      url.searchParams.get("shop");

    const customerId =
      url.searchParams.get(
        "logged_in_customer_id"
      );

    if (!shop || !customerId) {
      return Response.json(
        {
          success: false,
          error:
            "Please log in to become an ambassador.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Check eligibility.
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
      return Response.json(
        {
          success: false,
          error:
            "You are not currently eligible.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Check if already ambassador.
     */

    const existing =
      await db.ambassador.findFirst({
        where: {
          shop,
          customerId,
        },
      });

    if (existing) {
      return Response.json({
        success: true,
        alreadyAmbassador: true,
        referralCode:
          existing.referralCode,
      });
    }

    if (!admin) {
      return Response.json(
        {
          success: false,
          error:
            "Store authorization is unavailable.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Get customer details from Shopify.
     */

    const response =
      await admin.graphql(
        `#graphql
        query GetCustomer($id: ID!) {
          customer(id: $id) {
            id
            firstName
            lastName
            email
            phone
          }
        }`,
        {
          variables: {
            id: customerGid(customerId),
          },
        }
      );

    const result =
      await response.json();

    const customer =
      result?.data?.customer;

    if (!customer) {
      return Response.json(
        {
          success: false,
          error:
            "Customer could not be found.",
        },
        {
          status: 404,
        }
      );
    }

    const name =
      `${customer.firstName || ""} ${
        customer.lastName || ""
      }`.trim() ||
      "Ambassador";

    if (!customer.email) {
      return Response.json(
        {
          success: false,
          error:
            "A customer email is required to become an ambassador.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Generate unique referral code.
     */

    let referralCode;
    let codeExists = true;

    while (codeExists) {
      referralCode =
        createReferralCode(name);

      const existingCode =
        await db.ambassador.findUnique({
          where: {
            referralCode,
          },
        });

      codeExists = Boolean(
        existingCode
      );
    }

    /*
     * Create ambassador.
     */

    const ambassador =
      await db.ambassador.create({
        data: {
          shop,

          customerId:
            String(customerId),

          name,

          email:
            customer.email,

          phone:
            customer.phone
              ? String(customer.phone)
              : null,

          referralCode,

          status: "ACTIVE",
        },
      });

    /*
     * Send the welcome email with their referral link/code.
     * A failure here doesn't block ambassador creation.
     */

    await sendWelcomeEmail(customer.email, name, referralCode);

    console.log(
      "========================================"
    );

    console.log(
      "NEW JOYSHOP AMBASSADOR"
    );

    console.log(
      "Customer:",
      name
    );

    console.log(
      "Email:",
      customer.email
    );

    console.log(
      "Referral Code:",
      referralCode
    );

    console.log(
      "========================================"
    );

    return Response.json({
      success: true,
      referralCode,
      name,
    });
  } catch (error) {
    console.error(
      "BECOME AMBASSADOR ERROR:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Something went wrong. Please try again.",
      },
      {
        status: 500,
      }
    );
  }
};
