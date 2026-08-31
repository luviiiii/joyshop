-- CreateTable
CREATE TABLE "AmbassadorEligibility" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eligibleAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmbassadorEligibility_shop_idx" ON "AmbassadorEligibility"("shop");

-- CreateIndex
CREATE INDEX "AmbassadorEligibility_customerId_idx" ON "AmbassadorEligibility"("customerId");

-- CreateIndex
CREATE INDEX "AmbassadorEligibility_eligible_idx" ON "AmbassadorEligibility"("eligible");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorEligibility_shop_customerId_key" ON "AmbassadorEligibility"("shop", "customerId");
