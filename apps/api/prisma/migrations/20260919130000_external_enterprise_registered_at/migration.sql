-- 合作企业：移除累计合作次数；首次合作改为登记日期（审核通过当天）
ALTER TABLE "ExternalEnterpriseProfile" DROP COLUMN IF EXISTS "cooperationCount";
ALTER TABLE "ExternalEnterpriseProfile" RENAME COLUMN "firstCooperationAt" TO "registeredAt";
