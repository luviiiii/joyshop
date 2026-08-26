const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("      JOYSHOP REFERRAL TEST");
  console.log("==========================================");

  // --------------------------------------------------
  // TEST VALUES
  // --------------------------------------------------

  const referralCode = "KARINERU-57WS06";

  // Fake customer - NO REAL SHOPIFY CUSTOMER
  const fakeCustomerId = `TEST-CUSTOMER-${Date.now()}`;

  // Fake order - NO REAL SHOPIFY ORDER
  const fakeOrderId = `TEST-ORDER-${Date.now()}`;

  // Simulated order amount
  const orderAmount = 1000;

  console.log("");
  console.log("Referral Code :", referralCode);
  console.log("Fake Customer :", fakeCustomerId);
  console.log("Fake Order    :", fakeOrderId);
  console.log("Order Amount  : ₹" + orderAmount);

  // --------------------------------------------------
  // 1. FIND AMBASSADOR
  // --------------------------------------------------

  const ambassador = await prisma.ambassador.findUnique({
    where: {
      referralCode: referralCode,
    },
  });

  if (!ambassador) {
    throw new Error(
      `Ambassador with referral code ${referralCode} was not found.`
    );
  }

  console.log("");
  console.log("AMBASSADOR FOUND");
  console.log("------------------------------------------");
  console.log("Name :", ambassador.name);
  console.log("Email:", ambassador.email);
  console.log("Shop :", ambassador.shop);
  console.log("ID   :", ambassador.id);

  // --------------------------------------------------
  // 2. GET REFERRAL SETTINGS
  // --------------------------------------------------

  let settings = await prisma.referralSettings.findUnique({
    where: {
      shop: ambassador.shop,
    },
  });

  // Create default settings if none exist
  if (!settings) {
    settings = await prisma.referralSettings.create({
      data: {
        shop: ambassador.shop,
        enabled: true,
        ambassadorEligibilityAmount: 10000,
        invitationValidityDays: 30,
        firstOrderCredit: 200,
        firstOrderCreditEnabled: true,
        commissionRate: 10,
        referralAttribution: "FIRST_VALID",
        commissionOnPaidOrders: true,
        excludeCancelledOrders: true,
      },
    });

    console.log("");
    console.log("Referral settings did not exist.");
    console.log("Default settings were created.");
  }

  console.log("");
  console.log("REFERRAL SETTINGS");
  console.log("------------------------------------------");
  console.log("Enabled         :", settings.enabled);
  console.log("Commission Rate :", settings.commissionRate + "%");
  console.log("First Order     :", settings.firstOrderCredit);
  console.log("Credit Enabled  :", settings.firstOrderCreditEnabled);

  if (!settings.enabled) {
    throw new Error("Referral program is disabled.");
  }

  // --------------------------------------------------
  // 3. CREATE FAKE REFERRAL
  // --------------------------------------------------

  const referral = await prisma.referral.create({
    data: {
      shop: ambassador.shop,
      ambassadorId: ambassador.id,

      referredCustomerId: fakeCustomerId,
      referredName: "Test Customer",
      referredEmail: "test-customer@example.com",

      status: "ACTIVE",
    },
  });

  console.log("");
  console.log("REFERRAL CREATED");
  console.log("------------------------------------------");
  console.log("Referral ID :", referral.id);
  console.log("Customer ID :", referral.referredCustomerId);

  // --------------------------------------------------
  // 4. CREATE FIRST ORDER CREDIT
  // --------------------------------------------------

  let referralCredit = null;

  if (settings.firstOrderCreditEnabled) {
    referralCredit = await prisma.referralCredit.create({
      data: {
        shop: ambassador.shop,
        customerId: fakeCustomerId,
        referralId: referral.id,

        amount: settings.firstOrderCredit,
        status: "AVAILABLE",

        orderId: fakeOrderId,

        expiresAt: settings.creditExpiryDays
          ? new Date(
              Date.now() +
                settings.creditExpiryDays * 24 * 60 * 60 * 1000
            )
          : null,
      },
    });

    console.log("");
    console.log("FIRST ORDER CREDIT CREATED");
    console.log("------------------------------------------");
    console.log("Credit ID :", referralCredit.id);
    console.log("Amount    : ₹" + referralCredit.amount);
    console.log("Status    :", referralCredit.status);
  }

  // --------------------------------------------------
  // 5. CALCULATE COMMISSION
  // --------------------------------------------------

  const commissionRate = settings.commissionRate;

  const commissionAmount =
    (orderAmount * commissionRate) / 100;

  console.log("");
  console.log("COMMISSION CALCULATION");
  console.log("------------------------------------------");
  console.log("Order Amount     : ₹" + orderAmount);
  console.log("Commission Rate  : " + commissionRate + "%");
  console.log("Commission       : ₹" + commissionAmount);

  // --------------------------------------------------
  // 6. CREATE COMMISSION
  // --------------------------------------------------

  const commission = await prisma.commission.create({
    data: {
      shop: ambassador.shop,

      ambassadorId: ambassador.id,
      referralId: referral.id,

      customerId: fakeCustomerId,
      orderId: fakeOrderId,

      orderAmount: orderAmount,
      commissionRate: commissionRate,
      commissionAmount: commissionAmount,

      status: "PENDING",
    },
  });

  console.log("");
  console.log("COMMISSION CREATED");
  console.log("------------------------------------------");
  console.log("Commission ID :", commission.id);
  console.log("Order ID      :", commission.orderId);
  console.log("Amount        : ₹" + commission.commissionAmount);
  console.log("Status        :", commission.status);

  // --------------------------------------------------
  // 7. UPDATE AMBASSADOR STATISTICS
  // --------------------------------------------------

  const updatedAmbassador =
    await prisma.ambassador.update({
      where: {
        id: ambassador.id,
      },

      data: {
        totalReferrals: {
          increment: 1,
        },

        totalOrders: {
          increment: 1,
        },

        totalEarnings: {
          increment: commissionAmount,
        },
      },
    });

  // --------------------------------------------------
  // 8. MARK REFERRAL VISIT AS CONVERTED
  // --------------------------------------------------

  await prisma.referralVisit.updateMany({
    where: {
      shop: ambassador.shop,
      referralCode: referralCode,
      converted: false,
    },

    data: {
      converted: true,
      convertedAt: new Date(),
      customerId: fakeCustomerId,
    },
  });

  // --------------------------------------------------
  // FINAL RESULT
  // --------------------------------------------------

  console.log("");
  console.log("");
  console.log("==========================================");
  console.log("        REFERRAL TEST SUCCESSFUL");
  console.log("==========================================");

  console.log("");
  console.log("Ambassador       :", updatedAmbassador.name);
  console.log("Referral Code    :", updatedAmbassador.referralCode);
  console.log("Fake Customer    :", fakeCustomerId);
  console.log("Fake Order       :", fakeOrderId);

  console.log("");
  console.log("Simulated Order  : ₹" + orderAmount);
  console.log("Commission Rate  : " + commissionRate + "%");
  console.log("Commission       : ₹" + commissionAmount);

  console.log("");
  console.log("TOTAL REFERRALS  :", updatedAmbassador.totalReferrals);
  console.log("TOTAL ORDERS     :", updatedAmbassador.totalOrders);
  console.log("TOTAL EARNINGS   : ₹" + updatedAmbassador.totalEarnings);

  console.log("");
  console.log("==========================================");
  console.log("No real Shopify order was created.");
  console.log("No real customer was created.");
  console.log("==========================================");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("==========================================");
    console.error("REFERRAL TEST FAILED");
    console.error("==========================================");
    console.error("");
    console.error(error);
    console.error("");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });