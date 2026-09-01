import { authenticate } from "../shopify.server";
import db from "../db.server";

function customerGid(customerId) {
  if (!customerId) {
    return null;
  }

  const value = String(customerId);

  if (value.startsWith("gid://shopify/Customer/")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

export const action = async ({ request }) => {
  try {
    const {
      shop,
      topic,
      payload,
      admin,
      session,
    } = await authenticate.webhook(request);

    console.log("========================================");
    console.log("JOYSHOP ORDER WEBHOOK");
    console.log("Topic:", topic);
    console.log("Shop:", shop);

    if (!session) {
      console.log("No Shopify session available.");
      console.log("========================================");

      return new Response();
    }

    const order = payload;

    console.log("Order ID:", order.id);
    console.log("Order Name:", order.name);
    console.log(
      "Financial Status:",
      order.financial_status
    );

    /*
     * Only process paid orders
     */

    if (topic !== "ORDERS_PAID") {
      console.log(
        "Ignoring webhook topic:",
        topic
      );

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

    console.log(
      "Customer ID:",
      customerId
    );

    console.log(
      "Order ID:",
      orderId
    );

    console.log(
      "Order Amount:",
      orderAmount
    );

    if (!orderId) {
      console.log(
        "Missing order ID"
      );

      return new Response();
    }

    /*
     * =====================================================
     * 1. AMBASSADOR ELIGIBILITY
     * =====================================================
     */

    if (customerId && admin) {
      try {
        /*
         * Load referral settings
         */

        let settings =
          await db.referralSettings.findUnique({
            where: {
              shop,
            },
          });

        /*
         * Create default settings if missing
         */

        if (!settings) {
          settings =
            await db.referralSettings.create({
              data: {
                shop,
              },
            });
        }

        const eligibilityAmount =
          Number(
            settings.ambassadorEligibilityAmount
          );

        /*
         * Get customer's lifetime spending
         * directly from Shopify.
         */

        const customerResponse =
          await admin.graphql(
            `#graphql
            query GetCustomerSpend($id: ID!) {
              customer(id: $id) {
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
            }`,
            {
              variables: {
                id: customerGid(customerId),
              },
            }
          );

        const customerResult =
          await customerResponse.json();

        const customer =
          customerResult?.data?.customer;

        if (customer) {
          const totalSpent = Number(
            customer.amountSpent?.amount || 0
          );

          console.log(
            "Customer lifetime spend:",
            totalSpent
          );

          console.log(
            "Ambassador eligibility:",
            eligibilityAmount
          );

          /*
           * Check if customer is already ambassador
           */

          const existingAmbassador =
            await db.ambassador.findFirst({
              where: {
                shop,
                customerId,
              },
            });

          /*
           * Determine eligibility
           */

          const isEligible =
            totalSpent >= eligibilityAmount;

          /*
           * Get existing eligibility record
           */

          const existingEligibility =
            await db.ambassadorEligibility.findUnique({
              where: {
                shop_customerId: {
                  shop,
                  customerId,
                },
              },
            });

          /*
           * Customer crossed threshold
           */

          if (
            isEligible &&
            !existingAmbassador
          ) {
            await db.ambassadorEligibility.upsert({
              where: {
                shop_customerId: {
                  shop,
                  customerId,
                },
              },

              update: {
                eligible: true,
                totalSpent,
                eligibleAt:
                  existingEligibility?.eligibleAt ||
                  new Date(),
              },

              create: {
                shop,
                customerId,
                eligible: true,
                totalSpent,
                eligibleAt: new Date(),
              },
            });

            console.log(
              "🎉 CUSTOMER IS NOW ELIGIBLE"
            );

            console.log(
              "Customer:",
              customer.email
            );

            console.log(
              "Total spent:",
              totalSpent
            );
          } else {
            /*
             * Keep tracking spending even before
             * eligibility is reached.
             */

            await db.ambassadorEligibility.upsert({
              where: {
                shop_customerId: {
                  shop,
                  customerId,
                },
              },

              update: {
                totalSpent,
                eligible:
                  isEligible ||
                  existingEligibility?.eligible ||
                  false,

                eligibleAt:
                  isEligible
                    ? existingEligibility?.eligibleAt ||
                      new Date()
                    : existingEligibility?.eligibleAt,
              },

              create: {
                shop,
                customerId,
                totalSpent,
                eligible: isEligible,
                eligibleAt: isEligible
                  ? new Date()
                  : null,
              },
            });
          }
        }
      } catch (eligibilityError) {
        /*
         * Eligibility failure should NOT stop
         * commission processing.
         */

        console.error(
          "AMBASSADOR ELIGIBILITY ERROR"
        );

        console.error(
          eligibilityError
        );
      }
    }

    /*
     * =====================================================
     * 2. PREVENT DUPLICATE COMMISSION
     * =====================================================
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
     * =====================================================
     * 3. FIND REFERRAL BY CUSTOMER
     * =====================================================
     */

    let referral = null;

    if (customerId) {
      referral =
        await db.referral.findFirst({
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
     * =====================================================
     * 4. FALLBACK TO REFERRAL CODE
     * =====================================================
     */

    if (
      !referral &&
      Array.isArray(order.note_attributes)
    ) {
      const referralAttribute =
        order.note_attributes.find(
          (attribute) =>
            attribute.name ===
            "joyshop_referral"
        );

      if (referralAttribute?.value) {
        referral =
          await db.referral.findFirst({
            where: {
              shop,

              ambassador: {
                referralCode:
                  referralAttribute.value,
              },

              status: "ACTIVE",
            },

            include: {
              ambassador: true,
            },
          });
      }
    }

    /*
     * =====================================================
     * 5. NO REFERRAL
     * =====================================================
     */

    if (!referral) {
      console.log(
        "No referral found for this order."
      );

      console.log(
        "========================================"
      );

      return new Response();
    }

    const ambassador =
      referral.ambassador;

    console.log(
      "Referral found:",
      referral.id
    );

    console.log(
      "Ambassador:",
      ambassador.name
    );

    /*
     * =====================================================
     * 6. LOAD COMMISSION SETTINGS
     * =====================================================
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
      (orderAmount *
        commissionRate) /
      100;

    /*
     * =====================================================
     * 7. CREATE COMMISSION
     * =====================================================
     */

    const commission =
      await db.commission.create({
        data: {
          shop,

          ambassadorId:
            ambassador.id,

          referralId:
            referral.id,

          customerId:
            customerId ||
            referral.referredCustomerId,

          orderId,

          orderAmount,

          commissionRate,

          commissionAmount,

          status: "PENDING",
        },
      });

    /*
     * =====================================================
     * 8. UPDATE AMBASSADOR STATISTICS
     * =====================================================
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
          increment:
            commissionAmount,
        },
      },
    });

    /*
     * =====================================================
     * 9. MARK REFERRAL VISIT CONVERTED
     * =====================================================
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

    console.log(
      "========================================"
    );

    return new Response();
  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "JOYSHOP ORDER WEBHOOK ERROR"
    );

    console.error(error);

    console.error(
      "========================================"
    );

    /*
     * Keep returning 200 while developing.
     */

    return new Response();
  }
};