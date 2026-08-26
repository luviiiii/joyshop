/*
  Warnings:

  - Added the required column `product` to the `Affiliate` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "product" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Affiliate" ("clicks", "code", "commission", "createdAt", "email", "id", "name", "orders", "phone", "shop", "updatedAt") SELECT "clicks", "code", "commission", "createdAt", "email", "id", "name", "orders", "phone", "shop", "updatedAt" FROM "Affiliate";
DROP TABLE "Affiliate";
ALTER TABLE "new_Affiliate" RENAME TO "Affiliate";
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
