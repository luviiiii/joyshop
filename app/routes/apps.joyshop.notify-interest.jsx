import { authenticate } from "../shopify.server";
import { Resend } from "resend";
import db from "../db.server";

const resend = new Resend(process.env.RESEND_API_KEY);

/*
 * Update these to match your real sending address and
 * the live application page URL.
 */
const FROM_ADDRESS = "JOYSHOP Ambassador Program <ambassador@justorganik.co>";
const APPLICATION_PAGE_URL = "https://www.justorganik.co/pages/become-an-ambassador";

function customerGid(customerId) {
  if (!customerId) return null;

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return Response.json(
        {
          success: false,
          error: "Please log in to continue.",
        },
        { status: 401 }
      );
    }

    if (!admin) {
      return Response.json(
        {
          success: false,
          error: "Store authorization is unavailable.",
        },
        { status: 500 }
      );
    }

    /*
     * Look up the customer's name and email.
     */

    const response = await admin.graphql(
      `#graphql
      query GetCustomer($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          email
        }
      }`,
      {
        variables: {
          id: customerGid(customerId),
        },
      }
    );

    const result = await response.json();

    const customer = result?.data?.customer;

    if (!customer || !customer.email) {
      return Response.json(
        {
          success: false,
          error: "We couldn't find an email on your account.",
        },
        { status: 404 }
      );
    }

    const firstName = customer.firstName || "there";

    /*
     * Send the email via Resend.
     */

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: customer.email,
      subject: "Complete Your JOYSHOP Ambassador Application",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2d22;">
          <h2 style="color: #14532d;">Hi ${firstName},</h2>
          <p>
            Thanks for your interest in becoming a JOYSHOP Ambassador!
            You're just one step away &mdash; click below to complete
            your application.
          </p>
          <p style="text-align: center; margin: 32px 0;">
            <a
              href="${APPLICATION_PAGE_URL}"
              style="background: #14532d; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;"
            >
              Complete My Application
            </a>
          </p>
          <p style="font-size: 13px; color: #6b7a70;">
            If the button doesn't work, copy and paste this link into
            your browser:<br />
            ${APPLICATION_PAGE_URL}
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("RESEND SEND ERROR:", error);

      return Response.json(
        {
          success: false,
          error: "We couldn't send the email. Please try again.",
        },
        { status: 500 }
      );
    }

    console.log("========================================");
    console.log("AMBASSADOR INTEREST EMAIL SENT");
    console.log("Customer:", customer.email);
    console.log("========================================");

    /*
     * Record that this customer has expressed interest, so
     * the popup doesn't show again and the "Become an
     * Ambassador" button on the account page can send them
     * straight to the application form instead.
     */
    try {
      const updateResult = await db.ambassadorEligibility.updateMany({
        where: {
          shop,
          customerId,
        },
        data: {
          interestedAt: new Date(),
        },
      });

      console.log(
        "interestedAt update result (rows affected):",
        updateResult.count
      );
    } catch (updateError) {
      console.error(
        "Failed to record interestedAt (non-fatal):",
        updateError
      );
    }

    return Response.json({
      success: true,
      email: customer.email,
    });
  } catch (error) {
    console.error("NOTIFY INTEREST ERROR:", error);

    return Response.json(
      {
        success: false,
        error: "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
};
