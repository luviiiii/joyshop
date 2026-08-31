-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT,
    "accountDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payout_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Payout_shop_idx" ON "Payout"("shop");

-- CreateIndex
CREATE INDEX "Payout_ambassadorId_idx" ON "Payout"("ambassadorId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");
