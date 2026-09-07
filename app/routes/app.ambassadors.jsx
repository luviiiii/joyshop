import { useLoaderData, Form } from "react-router";
import { useState, useRef } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Storefront domain used to build the shareable referral link.
const STOREFRONT_DOMAIN = "https://www.justorganik.co";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = session.shop;

  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("q")?.trim() || "";

  // Get existing ambassadors
  const ambassadors = await db.ambassador.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  /*
   * Build the Shopify customer search query.
   * Shopify's customer search syntax lets us match across
   * name, email, and phone with a single free-text term.
   */
  const customerQuery = searchTerm
    ? `#graphql
      query SearchCustomers($query: String!) {
        customers(first: 50, query: $query) {
          nodes {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
          }
        }
      }`
    : `#graphql
      query GetCustomers {
        customers(first: 50) {
          nodes {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
          }
        }
      }`;

  const response = await admin.graphql(
    customerQuery,
    searchTerm ? { variables: { query: searchTerm } } : undefined
  );

  const result = await response.json();

  const customers = result?.data?.customers?.nodes || [];

  // Remove customers who are already ambassadors
  const ambassadorCustomerIds = new Set(
    ambassadors.map((ambassador) => plainCustomerId(ambassador.customerId))
  );

  const availableCustomers = customers.filter(
    (customer) => !ambassadorCustomerIds.has(plainCustomerId(customer.id))
  );

  return {
    shop,
    ambassadors,
    customers: availableCustomers,
    searchTerm,
  };
};

function customerGid(customerId) {
  if (!customerId) return null;

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

function plainCustomerId(customerId) {
  if (!customerId) return null;

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value.replace("gid://shopify/Customer/", "");
  }

  return value;
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  const formData = await request.formData();

  const actionType = formData.get("action");

  /*
   * DELETE AMBASSADOR
   * Permanently deletes the ambassador record. Because the
   * Referral, Commission, and Payout models all use
   * onDelete: Cascade on their ambassadorId relation, this
   * also permanently deletes all of that ambassador's
   * referral, commission, and payout history. This cannot
   * be undone.
   */
  if (actionType === "delete-ambassador") {
    const ambassadorId = formData.get("ambassadorId");

    if (!ambassadorId) {
      return {
        success: false,
        error: "Ambassador not found.",
      };
    }

    const ambassador = await db.ambassador.findFirst({
      where: { id: ambassadorId, shop },
    });

    if (!ambassador) {
      return {
        success: false,
        error: "Ambassador not found.",
      };
    }

    await db.ambassador.delete({
      where: { id: ambassador.id },
    });

    return {
      success: true,
      deleted: true,
    };
  }

  const customerId = formData.get("customerId");
  const name = formData.get("name");
  const email = formData.get("email");
  const phone = formData.get("phone");

  if (!customerId || !email) {
    return {
      success: false,
      error: "Customer information is missing.",
    };
  }

  // Check if customer is already an ambassador
  const existing = await db.ambassador.findFirst({
    where: {
      shop,
      customerId: plainCustomerId(customerId),
    },
  });

  if (existing) {
    return {
      success: false,
      error: "This customer is already an ambassador.",
    };
  }

  // Generate unique referral code
  const cleanName =
    String(name || "AMBASSADOR")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8) || "AMBASSADOR";

  const randomPart = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  const referralCode = `${cleanName}-${randomPart}`;

  const ambassador = await db.ambassador.create({
    data: {
      shop,
      customerId: plainCustomerId(customerId),
      name: String(name || "Ambassador"),
      email: String(email),
      phone: phone ? String(phone) : null,
      referralCode,
      status: "ACTIVE",
    },
  });

  return {
    success: true,
    ambassador,
  };
};

function money(amount, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function buildReferralLink(referralCode) {
  return `${STOREFRONT_DOMAIN}/?ref=${encodeURIComponent(referralCode)}`;
}

/* =========================================================
   REFERRAL LINK ROW WITH COPY BUTTON
========================================================= */

/* =========================================================
   DELETE AMBASSADOR FORM (two-click confirmation)

   NOTE: window.confirm()/alert() are unreliable inside
   Shopify's embedded admin iframe (often silently blocked by
   the iframe sandbox), so we use an in-page two-click
   confirmation instead of a native dialog.
========================================================= */

function DeleteAmbassadorForm({ ambassadorId }) {
  const formRef = useRef(null);
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef(null);

  function handleFirstClick() {
    setConfirming(true);

    timeoutRef.current = setTimeout(() => {
      setConfirming(false);
    }, 4000);
  }

  function handleConfirmClick() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    formRef.current?.requestSubmit();
  }

  function handleCancelClick() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setConfirming(false);
  }

  return (
    <Form method="post" ref={formRef}>
      <input type="hidden" name="action" value="delete-ambassador" />
      <input type="hidden" name="ambassadorId" value={ambassadorId} />

      {!confirming ? (
        <s-button type="button" tone="critical" onclick={handleFirstClick}>
          Delete Ambassador
        </s-button>
      ) : (
        <s-stack direction="inline" gap="small" align="center">
          <s-text>Delete permanently, including all history?</s-text>
          <s-button type="button" tone="critical" onclick={handleConfirmClick}>
            Yes, Delete
          </s-button>
          <s-button type="button" onclick={handleCancelClick}>
            Cancel
          </s-button>
        </s-stack>
      )}
    </Form>
  );
}

function ReferralLinkRow({ referralCode }) {
  const [copied, setCopied] = useState(false);

  const referralLink = buildReferralLink(referralCode);

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = referralLink;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy referral link:", error);
    }
  }

  return (
    <s-stack direction="inline" gap="small" align="center">
      <s-text>
        Referral Link:{" "}
        <strong>{referralLink}</strong>
      </s-text>

      <s-button onclick={handleCopy}>
        {copied ? "Copied!" : "Copy Link"}
      </s-button>
    </s-stack>
  );
}

export default function Ambassadors() {
  const { ambassadors, customers, searchTerm } = useLoaderData();

  return (
    <s-page heading="Ambassadors">

      {/* HEADER */}
      <s-section>
        <s-stack direction="block" gap="base">

          <s-heading>
            JOYSHOP Ambassador Program
          </s-heading>

          <s-text>
            Manage ambassadors, referral links, referrals and earnings from
            one place.
          </s-text>

        </s-stack>
      </s-section>

      {/* CURRENT AMBASSADORS */}
      <s-section heading="Current Ambassadors">

        {ambassadors.length === 0 ? (
          <s-banner tone="info">
            No ambassadors have been created yet.
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">

            {ambassadors.map((ambassador) => (
              <s-card key={ambassador.id}>

                <s-stack direction="block" gap="base">

                  <s-stack
                    direction="inline"
                    gap="base"
                    align="center"
                    justify="space-between"
                  >

                    <s-stack direction="block" gap="small">

                      <s-heading>
                        {ambassador.name}
                      </s-heading>

                      <s-text>
                        {ambassador.email}
                      </s-text>

                      <s-text>
                        Referral Code:{" "}
                        <strong>{ambassador.referralCode}</strong>
                      </s-text>

                    </s-stack>

                    <s-stack direction="block" gap="small">

                      <s-text>
                        Referrals: {ambassador.totalReferrals}
                      </s-text>

                      <s-text>
                        Orders: {ambassador.totalOrders}
                      </s-text>

                      <s-text>
                        Earnings: {money(ambassador.totalEarnings)}
                      </s-text>

                    </s-stack>

                  </s-stack>

                  <ReferralLinkRow
                    referralCode={ambassador.referralCode}
                  />

                  <DeleteAmbassadorForm ambassadorId={ambassador.id} />

                </s-stack>

              </s-card>
            ))}

          </s-stack>
        )}

      </s-section>

      {/* CUSTOMER SEARCH + LIST */}
      <s-section heading="Create Ambassador">

        <s-text>
          Select a Shopify customer to make them an ambassador.
        </s-text>

        <Form method="get" style={{ marginTop: "12px", marginBottom: "12px" }}>

          <s-stack direction="inline" gap="small" align="center">

            <input
              type="text"
              name="q"
              placeholder="Search by name, email or phone..."
              defaultValue={searchTerm}
              style={{
                flex: 1,
                minWidth: "260px",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #d6dfd8",
                fontSize: "14px",
              }}
            />

            <s-button type="submit">
              Search
            </s-button>

            {searchTerm && (
              <s-button href="/app/ambassadors">
                Clear
              </s-button>
            )}

          </s-stack>

        </Form>

        {searchTerm && (
          <s-text>
            Showing results for "<strong>{searchTerm}</strong>"
          </s-text>
        )}

        {customers.length === 0 ? (
          <s-banner tone="info">
            {searchTerm
              ? `No customers found matching "${searchTerm}".`
              : "All available customers are already ambassadors, or your store does not have any customers yet."}
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">

            {customers.map((customer) => {

              const customerName =
                `${customer.firstName || ""} ${
                  customer.lastName || ""
                }`.trim() || "Unnamed Customer";

              return (
                <s-card key={customer.id}>

                  <s-stack
                    direction="inline"
                    gap="base"
                    align="center"
                    justify="space-between"
                  >

                    <s-stack direction="block" gap="small">

                      <s-heading>
                        {customerName}
                      </s-heading>

                      <s-text>
                        {customer.email || "No email"}
                      </s-text>

                      {customer.phone && (
                        <s-text>
                          {customer.phone}
                        </s-text>
                      )}

                      <s-text>
                        Orders: {customer.numberOfOrders || 0}
                      </s-text>

                      <s-text>
                        Spent:{" "}
                        {money(
                          customer.amountSpent?.amount,
                          customer.amountSpent?.currencyCode || "INR"
                        )}
                      </s-text>

                    </s-stack>

                    <Form method="post">

                      <input
                        type="hidden"
                        name="customerId"
                        value={customer.id}
                      />

                      <input
                        type="hidden"
                        name="name"
                        value={customerName}
                      />

                      <input
                        type="hidden"
                        name="email"
                        value={customer.email || ""}
                      />

                      <input
                        type="hidden"
                        name="phone"
                        value={customer.phone || ""}
                      />

                      <s-button
                        type="submit"
                        variant="primary"
                      >
                        Make Ambassador
                      </s-button>

                    </Form>

                  </s-stack>

                </s-card>
              );
            })}

          </s-stack>
        )}

      </s-section>

    </s-page>
  );
}
