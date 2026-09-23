-- Creates the missing Referral record for customer 24779665998189,
-- referred by ambassador Mohini Sss (MOHINISS-4E2YOA).
-- Name/email/phone are left blank on purpose — your existing
-- dashboard backfill logic will fill those in automatically
-- the next time Mohini's dashboard loads.
 
INSERT INTO "Referral" (
  "id", "shop", "ambassadorId", "referredCustomerId", "status", "joinedAt", "createdAt"
) VALUES
  (gen_random_uuid()::text, 'just-organik-3jnutg3g.myshopify.com', 'cmu8c31tc0000nz3a8z6lhuze', '24779665998189', 'ACTIVE', NOW(), NOW());
 
-- Keep Mohini's referral count accurate to match.
UPDATE "Ambassador"
SET "totalReferrals" = "totalReferrals" + 1
WHERE "id" = 'cmu8c31tc0000nz3a8z6lhuze';