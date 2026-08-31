-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ambassador" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalReferrals" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ambassador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralVisit" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "visitorId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "customerId" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "referredCustomerId" TEXT NOT NULL,
    "referredName" TEXT,
    "referredEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCredit" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ReferralCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "accountDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "ambassadorEligibilityAmount" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "invitationValidityDays" INTEGER NOT NULL DEFAULT 30,
    "firstOrderCredit" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "firstOrderCreditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "creditExpiryDays" INTEGER,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "referralAttribution" TEXT NOT NULL DEFAULT 'FIRST_VALID',
    "commissionOnPaidOrders" BOOLEAN NOT NULL DEFAULT true,
    "excludeCancelledOrders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_referralCode_key" ON "Ambassador"("referralCode");

-- CreateIndex
CREATE INDEX "Ambassador_shop_idx" ON "Ambassador"("shop");

-- CreateIndex
CREATE INDEX "Ambassador_email_idx" ON "Ambassador"("email");

-- CreateIndex
CREATE INDEX "Ambassador_referralCode_idx" ON "Ambassador"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_shop_customerId_key" ON "Ambassador"("shop", "customerId");

-- CreateIndex
CREATE INDEX "ReferralVisit_shop_idx" ON "ReferralVisit"("shop");

-- CreateIndex
CREATE INDEX "ReferralVisit_referralCode_idx" ON "ReferralVisit"("referralCode");

-- CreateIndex
CREATE INDEX "ReferralVisit_visitorId_idx" ON "ReferralVisit"("visitorId");

-- CreateIndex
CREATE INDEX "ReferralVisit_customerId_idx" ON "ReferralVisit"("customerId");

-- CreateIndex
CREATE INDEX "Referral_ambassadorId_idx" ON "Referral"("ambassadorId");

-- CreateIndex
CREATE INDEX "Referral_referredCustomerId_idx" ON "Referral"("referredCustomerId");

-- CreateIndex
CREATE INDEX "Referral_shop_idx" ON "Referral"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_shop_referredCustomerId_key" ON "Referral"("shop", "referredCustomerId");

-- CreateIndex
CREATE INDEX "ReferralCredit_customerId_idx" ON "ReferralCredit"("customerId");

-- CreateIndex
CREATE INDEX "ReferralCredit_referralId_idx" ON "ReferralCredit"("referralId");

-- CreateIndex
CREATE INDEX "ReferralCredit_shop_idx" ON "ReferralCredit"("shop");

-- CreateIndex
CREATE INDEX "ReferralCredit_status_idx" ON "ReferralCredit"("status");

-- CreateIndex
CREATE INDEX "Commission_ambassadorId_idx" ON "Commission"("ambassadorId");

-- CreateIndex
CREATE INDEX "Commission_referralId_idx" ON "Commission"("referralId");

-- CreateIndex
CREATE INDEX "Commission_customerId_idx" ON "Commission"("customerId");

-- CreateIndex
CREATE INDEX "Commission_shop_idx" ON "Commission"("shop");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_shop_orderId_key" ON "Commission"("shop", "orderId");

-- CreateIndex
CREATE INDEX "Payout_shop_idx" ON "Payout"("shop");

-- CreateIndex
CREATE INDEX "Payout_ambassadorId_idx" ON "Payout"("ambassadorId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralSettings_shop_key" ON "ReferralSettings"("shop");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCredit" ADD CONSTRAINT "ReferralCredit_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
