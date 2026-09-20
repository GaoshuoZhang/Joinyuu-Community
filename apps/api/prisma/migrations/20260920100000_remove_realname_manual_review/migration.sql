ALTER TABLE "User"
ADD COLUMN "verifiedAt" VARCHAR(16);

UPDATE "User"
SET "verifiedAt" = COALESCE("realnameReviewedAt", "realnameSubmittedAt", "lastActiveAt", "registeredAt")
WHERE "realName" IS NOT NULL AND "citizenId" IS NOT NULL;

ALTER TABLE "User"
DROP COLUMN "realnameReviewStatus",
DROP COLUMN "realnameSubmittedAt",
DROP COLUMN "realnameReviewedAt",
DROP COLUMN "realnameReviewedBy",
DROP COLUMN "realnameReviewNote";

UPDATE "AdminPermission"
SET "name" = '注销治理'
WHERE "code" = '/member-governance';
