/*
  Warnings:

  - You are about to drop the `Affiliate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Affiliate";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Ambassador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalReferrals" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalEarnings" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "referredCustomerId" TEXT NOT NULL,
    "referredName" TEXT,
    "referredEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Referral_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralCredit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "expiresAt" DATETIME,
    CONSTRAINT "ReferralCredit_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" REAL NOT NULL,
    "commissionRate" REAL NOT NULL,
    "commissionAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Commission_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Commission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "ambassadorEligibilityAmount" REAL NOT NULL DEFAULT 10000,
    "invitationValidityDays" INTEGER NOT NULL DEFAULT 30,
    "firstOrderCredit" REAL NOT NULL DEFAULT 200,
    "firstOrderCreditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "creditExpiryDays" INTEGER,
    "commissionRate" REAL NOT NULL DEFAULT 10,
    "referralAttribution" TEXT NOT NULL DEFAULT 'FIRST_VALID',
    "commissionOnPaidOrders" BOOLEAN NOT NULL DEFAULT true,
    "excludeCancelledOrders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_customerId_key" ON "Ambassador"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_referralCode_key" ON "Ambassador"("referralCode");

-- CreateIndex
CREATE INDEX "Ambassador_shop_idx" ON "Ambassador"("shop");

-- CreateIndex
CREATE INDEX "Ambassador_email_idx" ON "Ambassador"("email");

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
CREATE UNIQUE INDEX "ReferralSettings_shop_key" ON "ReferralSettings"("shop");
