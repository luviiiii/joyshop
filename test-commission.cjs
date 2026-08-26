const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

async function main() {
  console.log("========================================");
  console.log("JOYSHOP TEST COMMISSION");
  console.log("========================================");

  // Find the most recently created referral
  const referral = await db.referral.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      ambassador: true,
    },
  });

  if (!referral) {
    console.log("❌ No referral found.");
    return;
  }

  console.log("Referral:", referral.id);
  console.log("Ambassador:", referral.ambassador.name);
  console.log("Customer:", referral.referredCustomerId);

  // Fake test order
  const orderId = "TEST-ORDER-" + Date.now();
  const orderAmount = 500;
  const commissionRate = 10;
  const commissionAmount =
    (orderAmount * commissionRate) / 100;

  console.log("Test Order:", orderId);
  console.log("Order Amount:", orderAmount);
  console.log("Commission:", commissionAmount);

  // Create commission
  const commission = await db.commission.create({
    data: {
      shop: referral.shop,
      ambassadorId: referral.ambassadorId,
      referralId: referral.id,
      customerId: referral.referredCustomerId,
      orderId,
      orderAmount,
      commissionRate,
      commissionAmount,
      status: "PENDING",
    },
  });

  console.log("✅ COMMISSION CREATED:", commission.id);

  // Update ambassador statistics
  await db.ambassador.update({
    where: {
      id: referral.ambassadorId,
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

  console.log("✅ AMBASSADOR STATISTICS UPDATED");

  // Mark referral visits as converted
  await db.referralVisit.updateMany({
    where: {
      shop: referral.shop,
      referralCode: referral.ambassador.referralCode,
      converted: false,
    },
    data: {
      converted: true,
      convertedAt: new Date(),
    },
  });

  console.log("✅ REFERRAL VISIT MARKED AS CONVERTED");

  console.log("========================================");
  console.log("TEST COMPLETE");
  console.log("Commission: ₹" + commissionAmount);
  console.log("========================================");
}

main()
  .catch((error) => {
    console.error("❌ TEST FAILED");
    console.error(error);
  })
  .finally(async () => {
    await db.$disconnect();
  });