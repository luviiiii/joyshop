import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } =
      await authenticate.webhook(request);

    console.log("========================================");
    console.log("JOYSHOP ORDER WEBHOOK");
    console.log("Topic:", topic);
    console.log("Shop:", shop);

    const order = payload;

    console.log("Order ID:", order.id);
    console.log("Order Name:", order.name);
    console.log("Financial Status:", order.financial_status);

    /*
     * Only process paid orders
     */
    if (topic !== "ORDERS_PAID") {
      console.log("Ignoring webhook topic:", topic);
      return new Response();
    }

    /*
     * Shopify customer ID
     */
    const customerId = order.customer?.id
      ? String(order.customer.id)
      : null;

    /*
     * Shopify order ID
     */
    const orderId = order.id
      ? String(order.id)
      : null;

    /*
     * Order amount
     */
    const orderAmount = Number(
      order.current_total_price ||
      order.total_price ||
      0
    );

    console.log("Customer ID:", customerId);
    console.log("Order ID:", orderId);
    console.log("Order Amount:", orderAmount);

    if (!orderId) {
      console.log("Missing order ID");
      return new Response();
    }

    /*
     * Prevent duplicate commission
     */
    const existingCommission =
      await db.commission.findUnique({
        where: {
          shop_orderId: {
            shop,
            orderId,
          },
        },
      });

    if (existingCommission) {
      console.log(
        "Commission already exists:",
        existingCommission.id
      );

      return new Response();
    }

    /*
     * Find referral by customer
     */
    let referral = null;

    if (customerId) {
      referral = await db.referral.findFirst({
        where: {
          shop,
          referredCustomerId: customerId,
          status: "ACTIVE",
        },
        include: {
          ambassador: true,
        },
      });
    }

    /*
     * If no referral was found by customer,
     * check Shopify order attributes for referral code.
     */
    if (!referral && Array.isArray(order.note_attributes)) {
      const referralAttribute =
        order.note_attributes.find(
          (attribute) =>
            attribute.name === "joyshop_referral"
        );

      if (referralAttribute?.value) {
        referral = await db.referral.findFirst({
          where: {
            shop,
            ambassador: {
              referralCode: referralAttribute.value,
            },
            status: "ACTIVE",
          },
          include: {
            ambassador: true,
          },
        });
      }
    }

    if (!referral) {
      console.log("No referral found for this order");
      console.log("========================================");

      return new Response();
    }

    const ambassador = referral.ambassador;

    console.log(
      "Referral found:",
      referral.id
    );

    console.log(
      "Ambassador:",
      ambassador.name
    );

    /*
     * Load referral settings
     */
    const settings =
      await db.referralSettings.findUnique({
        where: {
          shop,
        },
      });

    const commissionRate =
      settings?.commissionRate ?? 10;

    const commissionAmount =
      (orderAmount * commissionRate) / 100;

    /*
     * Create commission
     */
    const commission =
      await db.commission.create({
        data: {
          shop,
          ambassadorId: ambassador.id,
          referralId: referral.id,
          customerId: customerId || referral.referredCustomerId,
          orderId,
          orderAmount,
          commissionRate,
          commissionAmount,
          status: "PENDING",
        },
      });

    /*
     * Update ambassador statistics
     */
    await db.ambassador.update({
      where: {
        id: ambassador.id,
      },
      data: {
        totalOrders: {
          increment: 1,
        },
        totalEarnings: {
          increment: commissionAmount,
        },
      },
    });

    /*
     * Mark referral visit as converted
     */
    if (customerId) {
      await db.referralVisit.updateMany({
        where: {
          shop,
          referralCode:
            ambassador.referralCode,
          customerId,
          converted: false,
        },
        data: {
          converted: true,
          convertedAt: new Date(),
        },
      });
    } else {
      await db.referralVisit.updateMany({
        where: {
          shop,
          referralCode:
            ambassador.referralCode,
          converted: false,
        },
        data: {
          converted: true,
          convertedAt: new Date(),
        },
      });
    }

    console.log(
      "Commission created:",
      commission.id
    );

    console.log(
      "Commission amount:",
      commissionAmount
    );

    console.log("========================================");

    /*
     * Shopify requires a successful 200 response.
     */
    return new Response();
  } catch (error) {
    console.error("========================================");
    console.error("JOYSHOP ORDER WEBHOOK ERROR");
    console.error(error);
    console.error("========================================");

    /*
     * Returning 200 prevents Shopify from repeatedly
     * retrying a webhook while we are developing.
     */
    return new Response();
  }
};