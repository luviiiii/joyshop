import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Fires the moment Shopify creates a brand-new customer
 * account. This is a definitive signal — no guessing based on
 * account age or order history needed. Used by
 * apps.joyshop.ref.track.jsx to distinguish a genuine new
 * signup (via a referral link) from an existing customer who
 * simply logged into their old account.
 */
export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);

    console.log("========================================");
    console.log("CUSTOMERS/CREATE WEBHOOK RECEIVED");
    console.log("Shop:", shop);
    console.log("Topic:", topic);

    const customerId = String(payload?.id || "");

    if (!customerId) {
      console.log("No customer ID in payload, ignoring.");
      return new Response();
    }

    console.log("New customer ID:", customerId);

    await db.newCustomerAccount.upsert({
      where: {
        shop_customerId: {
          shop,
          customerId,
        },
      },
      update: {},
      create: {
        shop,
        customerId,
      },
    });

    console.log("NewCustomerAccount record saved.");
    console.log("========================================");

    return new Response();
  } catch (error) {
    console.error("CUSTOMERS/CREATE WEBHOOK ERROR:", error);
    return new Response();
  }
};
