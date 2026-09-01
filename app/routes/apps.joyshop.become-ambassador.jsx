import { authenticate } from "../shopify.server";
import db from "../db.server";

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
     * Mark eligibility as converted.
     *
     * We leave the eligibility record,
     * but it will no longer trigger a popup
     * because the customer is now an ambassador.
     */

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