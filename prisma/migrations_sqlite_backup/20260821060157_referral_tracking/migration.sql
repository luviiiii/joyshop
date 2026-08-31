/*
  Warnings:

  - A unique constraint covering the columns `[shop,customerId]` on the table `Ambassador` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Ambassador_customerId_key";

-- CreateTable
CREATE TABLE "ReferralVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "visitorId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "customerId" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ReferralVisit_shop_idx" ON "ReferralVisit"("shop");

-- CreateIndex
CREATE INDEX "ReferralVisit_referralCode_idx" ON "ReferralVisit"("referralCode");

-- CreateIndex
CREATE INDEX "ReferralVisit_visitorId_idx" ON "ReferralVisit"("visitorId");

-- CreateIndex
CREATE INDEX "ReferralVisit_customerId_idx" ON "ReferralVisit"("customerId");

-- CreateIndex
CREATE INDEX "Ambassador_referralCode_idx" ON "Ambassador"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_shop_customerId_key" ON "Ambassador"("shop", "customerId");
