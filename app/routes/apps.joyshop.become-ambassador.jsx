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

function buildWelcomeEmail({ name, referralCode, referralLink, kycLink }) {
  const subject = "You've discovered JOY. Now, complete your KYC.";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2d22; line-height: 1.6;">

      <p>Dear ${name},</p>

      <p>
        You've discovered JOY. Now, remember to complete your KYC
        within 7 days.
      </p>

      <p>
        As a JOY Ambassador, we welcome you to a community of people
        who believe that healthy food free from chemicals and
        pilferage is everyone's right.
      </p>

      <h3 style="color: #14532d; margin-top: 28px;">What's in it for you?</h3>

      <p>
        <strong>Earn Monthly Rewards</strong><br />
        Earn 7%&ndash;15% rewards on qualifying sales generated
        through your personal referral link or code.
      </p>

      <p>
        <strong>Share the JOY</strong><br />
        Your friends and family can receive a &#8377;200 credit on
        their first qualifying order when they join through your
        referral.
      </p>

      <p>
        <strong>Be Part of a Community</strong><br />
        Connect with a growing community that believes in making
        genuine, thoughtful and conscious food choices.
      </p>

      <p>
        <strong>Dedicated Support</strong><br />
        We're here to help you get started, understand the
        programme and make the most of your Ambassador journey.
      </p>

      <h3 style="color: #14532d; margin-top: 28px;">A few things to know</h3>

      <ul style="padding-left: 20px;">
        <li>
          Your referral link/code is personal to you and should be
          shared within your genuine personal, social or
          professional community.
        </li>
        <li>
          Rewards are calculated on completed, qualifying referred
          sales.
        </li>
        <li>
          Ambassadors represent and recommend Just Organik &mdash;
          they do not act as employees, agents or distributors.
        </li>
        <li>
          You need to maintain &#8377;5,000 in qualifying purchases
          at MRP over every 3-month period to remain eligible for
          Ambassador rewards.
        </li>
      </ul>

      <p>
        Kindly upload your KYC documents &mdash; Aadhaar Card, PAN
        Card and Cancelled Cheque/Bank Statement &mdash; within 7
        days to enable you to receive rewards from your referrals.
      </p>

      <p style="text-align: center; margin: 32px 0;">
        <a
          href="${kycLink}"
          style="display: inline-block; background: #14532d; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 15px; text-decoration: none;"
        >
          Complete Your KYC
        </a>
      </p>

      <p style="font-size: 13px; color: #6b7a70;">
        Your referral link:
        <a href="${referralLink}" style="color: #14532d;">${referralLink}</a><br />
        Your referral code: <strong>${referralCode}</strong>
      </p>

      <p>Welcome to JOY.</p>

      <p>
        Warm regards,<br />
        Team Just Organik
      </p>

    </div>
  `;

  return { subject, html };
}

async function sendWelcomeEmail(email, name, referralCode) {
  try {
    const referralLink = `${STOREFRONT_DOMAIN}/?ref=${encodeURIComponent(referralCode)}`;
    const kycLink = `${STOREFRONT_DOMAIN}/pages/become-an-ambassador`;

    const { subject, html } = buildWelcomeEmail({
      name,
      referralCode,
      referralLink,
      kycLink,
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
