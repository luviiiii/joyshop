-- CreateIndex
CREATE UNIQUE INDEX "NewCustomerAccount_shop_customerId_key" ON "NewCustomerAccount"("shop", "customerId");
EOF
cat /mnt/user-data/outputs/migration_new_customer_account.sql
Output

-- CreateTable
CREATE TABLE "NewCustomerAccount" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewCustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewCustomerAccount_shop_customerId_key" ON "NewCustomerAccount"("shop", "customerId");