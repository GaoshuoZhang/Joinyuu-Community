ALTER TABLE "User"
ADD COLUMN "realnameReviewStatus" VARCHAR(16) NOT NULL DEFAULT 'unverified',
ADD COLUMN "realnameSubmittedAt" VARCHAR(16),
ADD COLUMN "realnameReviewedAt" VARCHAR(16),
ADD COLUMN "realnameReviewedBy" VARCHAR(64),
ADD COLUMN "realnameReviewNote" VARCHAR(255);

UPDATE "User"
SET "realnameReviewStatus" = 'approved',
    "realnameReviewedAt" = COALESCE("lastActiveAt", "registeredAt"),
    "realnameReviewedBy" = '历史数据迁移'
WHERE "realName" IS NOT NULL AND "citizenId" IS NOT NULL;

ALTER TABLE "AccountDeletionRequest"
ADD COLUMN "reviewedAt" VARCHAR(16),
ADD COLUMN "reviewedBy" VARCHAR(64),
ADD COLUMN "reviewNote" VARCHAR(255);

ALTER TABLE "IndividualCard"
ADD COLUMN "displayName" VARCHAR(64);

CREATE TABLE "CardFieldConfig" (
    "type" VARCHAR(16) NOT NULL,
    "editableFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" VARCHAR(16) NOT NULL,
    "updatedBy" VARCHAR(64) NOT NULL,
    CONSTRAINT "CardFieldConfig_pkey" PRIMARY KEY ("type")
);

INSERT INTO "CardFieldConfig" ("type", "editableFields", "updatedAt", "updatedBy") VALUES
('individual', ARRAY['displayName','age','politicalStatus','intro','industryExperience','skills','education','work','projects','honors','socials','customLinks','visibility'], '2026-09-17 00:00', '系统初始化'),
('enterprise', ARRAY['logo','industry','size','foundedAt','website','address','description','services','advantages'], '2026-09-17 00:00', '系统初始化');

INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES
('/member-governance', '注销与实名治理', '社区成员', 'menu', 25),
('/card-management', '名片管理', '社区成员', 'menu', 26);

INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT r."id", p."code" FROM "AdminRole" r CROSS JOIN "AdminPermission" p
WHERE (r."id" = 'R2' AND p."code" = '/card-management')
   OR (r."id" = 'R3' AND p."code" = '/member-governance')
ON CONFLICT DO NOTHING;
