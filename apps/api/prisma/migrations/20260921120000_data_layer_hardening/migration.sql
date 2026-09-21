-- 数据层中风险缺陷修复（BE-D4/D5/D6/D7/D8）
-- 应用方式：`prisma migrate deploy`（手写部分唯一索引无法由 Prisma 声明，禁止 migrate dev / db push 生成迁移）

-- ========== BE-D4：UserIdentity 唯一约束对可空列失效 ==========
-- @@unique([userId, type, enterpriseId]) 中 enterpriseId 可空，Postgres 下 NULL 互不相等，
-- 故对 individual / community_individual 完全失效；这里补「每用户至多一个」部分唯一索引。
-- 前置核对：库中不存在同 userId 下重复的 individual / community_individual 行（已确认 0 条冲突）。
CREATE UNIQUE INDEX "UserIdentity_one_individual_per_user_key"
  ON "UserIdentity"("userId") WHERE "type" = 'individual';
CREATE UNIQUE INDEX "UserIdentity_one_community_individual_per_user_key"
  ON "UserIdentity"("userId") WHERE "type" = 'community_individual';

-- ========== BE-D5：Policy(kind, version) 唯一性（仅已发布版本） ==========
-- 全量 @@unique([kind, version]) 已因阻断历史草稿/归档共存而被显式回滚（20260916165500），
-- 这里只约束 status='published' 的版本。
-- 前置核对：库中不存在同 kind+version 的多条 published 行（已确认 0 条冲突）。
CREATE UNIQUE INDEX "Policy_published_kind_version_key"
  ON "Policy"("kind", "version") WHERE "status" = 'published';

-- ========== BE-D6：归档扫描列（archivableAt / deletedAt）补索引 ==========
-- Announcement_deletedAt_idx 已存在，无需重复；其余模型此前均无相关索引。
CREATE INDEX "Application_archivableAt_idx" ON "Application"("archivableAt");
CREATE INDEX "Application_deletedAt_idx" ON "Application"("deletedAt");
CREATE INDEX "Demand_archivableAt_idx" ON "Demand"("archivableAt");
CREATE INDEX "Demand_deletedAt_idx" ON "Demand"("deletedAt");
CREATE INDEX "Project_archivableAt_idx" ON "Project"("archivableAt");
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
CREATE INDEX "CommunityEvent_archivableAt_idx" ON "CommunityEvent"("archivableAt");
CREATE INDEX "CommunityEvent_deletedAt_idx" ON "CommunityEvent"("deletedAt");
CREATE INDEX "MallGoods_archivableAt_idx" ON "MallGoods"("archivableAt");
CREATE INDEX "MallGoods_deletedAt_idx" ON "MallGoods"("deletedAt");
CREATE INDEX "RedemptionOrder_archivableAt_idx" ON "RedemptionOrder"("archivableAt");
CREATE INDEX "RedemptionOrder_deletedAt_idx" ON "RedemptionOrder"("deletedAt");
CREATE INDEX "Lease_archivableAt_idx" ON "Lease"("archivableAt");
CREATE INDEX "Lease_deletedAt_idx" ON "Lease"("deletedAt");
CREATE INDEX "SpaceReservation_archivableAt_idx" ON "SpaceReservation"("archivableAt");
CREATE INDEX "SpaceReservation_deletedAt_idx" ON "SpaceReservation"("deletedAt");
CREATE INDEX "Article_archivableAt_idx" ON "Article"("archivableAt");
CREATE INDEX "Article_deletedAt_idx" ON "Article"("deletedAt");
CREATE INDEX "Announcement_archivableAt_idx" ON "Announcement"("archivableAt");
CREATE INDEX "Enterprise_deletedAt_idx" ON "Enterprise"("deletedAt");
CREATE INDEX "ExternalEnterpriseProfile_deletedAt_idx" ON "ExternalEnterpriseProfile"("deletedAt");
CREATE INDEX "Space_deletedAt_idx" ON "Space"("deletedAt");

-- ========== BE-D7：无外键挂靠表产生孤儿，为可安全级联的两处补外键 ==========
-- 前置核对：MessageDeliveryLog 无悬挂 outboxId、EventTicket 无悬挂 enrollmentId（均 0 条孤儿）。
-- seed.ts 清理顺序已是子表优先（messageDeliveryLog → outboxMessage；eventEnrollment 删除将级联清理票据）。
ALTER TABLE "MessageDeliveryLog"
  ADD CONSTRAINT "MessageDeliveryLog_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "OutboxMessage"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "EventTicket"
  ADD CONSTRAINT "EventTicket_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "EventEnrollment"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- ========== BE-D8：String[] 列在库中可空，与 schema 的非可选声明不符 ==========
-- 先回填空数组，再收紧 NOT NULL；已有 DEFAULT ARRAY[]::TEXT[] 的列保持默认值不变。
UPDATE "AdminRole" SET "dataScope" = ARRAY[]::TEXT[] WHERE "dataScope" IS NULL;
ALTER TABLE "AdminRole" ALTER COLUMN "dataScope" SET NOT NULL;

UPDATE "Article" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;
ALTER TABLE "Article" ALTER COLUMN "tags" SET NOT NULL;

UPDATE "CommunityEvent" SET "visibilityIdentities" = ARRAY[]::TEXT[] WHERE "visibilityIdentities" IS NULL;
ALTER TABLE "CommunityEvent" ALTER COLUMN "visibilityIdentities" SET NOT NULL;
UPDATE "CommunityEvent" SET "visibilityLevels" = ARRAY[]::TEXT[] WHERE "visibilityLevels" IS NULL;
ALTER TABLE "CommunityEvent" ALTER COLUMN "visibilityLevels" SET NOT NULL;
UPDATE "CommunityEvent" SET "enrollmentIdentities" = ARRAY[]::TEXT[] WHERE "enrollmentIdentities" IS NULL;
ALTER TABLE "CommunityEvent" ALTER COLUMN "enrollmentIdentities" SET NOT NULL;
UPDATE "CommunityEvent" SET "enrollmentLevels" = ARRAY[]::TEXT[] WHERE "enrollmentLevels" IS NULL;
ALTER TABLE "CommunityEvent" ALTER COLUMN "enrollmentLevels" SET NOT NULL;
UPDATE "CommunityEvent" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;
ALTER TABLE "CommunityEvent" ALTER COLUMN "tags" SET NOT NULL;

UPDATE "Demand" SET "visibilityIdentities" = ARRAY[]::TEXT[] WHERE "visibilityIdentities" IS NULL;
ALTER TABLE "Demand" ALTER COLUMN "visibilityIdentities" SET NOT NULL;
UPDATE "Demand" SET "visibilityLevels" = ARRAY[]::TEXT[] WHERE "visibilityLevels" IS NULL;
ALTER TABLE "Demand" ALTER COLUMN "visibilityLevels" SET NOT NULL;
UPDATE "Demand" SET "enrollmentIdentities" = ARRAY[]::TEXT[] WHERE "enrollmentIdentities" IS NULL;
ALTER TABLE "Demand" ALTER COLUMN "enrollmentIdentities" SET NOT NULL;
UPDATE "Demand" SET "enrollmentLevels" = ARRAY[]::TEXT[] WHERE "enrollmentLevels" IS NULL;
ALTER TABLE "Demand" ALTER COLUMN "enrollmentLevels" SET NOT NULL;
UPDATE "Demand" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;
ALTER TABLE "Demand" ALTER COLUMN "tags" SET NOT NULL;

UPDATE "Enterprise" SET "services" = ARRAY[]::TEXT[] WHERE "services" IS NULL;
ALTER TABLE "Enterprise" ALTER COLUMN "services" SET NOT NULL;
UPDATE "Enterprise" SET "advantages" = ARRAY[]::TEXT[] WHERE "advantages" IS NULL;
ALTER TABLE "Enterprise" ALTER COLUMN "advantages" SET NOT NULL;
UPDATE "Enterprise" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;
ALTER TABLE "Enterprise" ALTER COLUMN "tags" SET NOT NULL;

UPDATE "IndividualCard" SET "skills" = ARRAY[]::TEXT[] WHERE "skills" IS NULL;
ALTER TABLE "IndividualCard" ALTER COLUMN "skills" SET NOT NULL;

UPDATE "MallGoods" SET "shippingMethods" = ARRAY[]::TEXT[] WHERE "shippingMethods" IS NULL;
ALTER TABLE "MallGoods" ALTER COLUMN "shippingMethods" SET NOT NULL;
UPDATE "MallGoods" SET "visibilityIdentities" = ARRAY[]::TEXT[] WHERE "visibilityIdentities" IS NULL;
ALTER TABLE "MallGoods" ALTER COLUMN "visibilityIdentities" SET NOT NULL;
UPDATE "MallGoods" SET "visibilityLevels" = ARRAY[]::TEXT[] WHERE "visibilityLevels" IS NULL;
ALTER TABLE "MallGoods" ALTER COLUMN "visibilityLevels" SET NOT NULL;
UPDATE "MallGoods" SET "orderIdentities" = ARRAY[]::TEXT[] WHERE "orderIdentities" IS NULL;
ALTER TABLE "MallGoods" ALTER COLUMN "orderIdentities" SET NOT NULL;
UPDATE "MallGoods" SET "orderLevels" = ARRAY[]::TEXT[] WHERE "orderLevels" IS NULL;
ALTER TABLE "MallGoods" ALTER COLUMN "orderLevels" SET NOT NULL;

UPDATE "Milestone" SET "owners" = ARRAY[]::TEXT[] WHERE "owners" IS NULL;
ALTER TABLE "Milestone" ALTER COLUMN "owners" SET NOT NULL;

UPDATE "Space" SET "equipment" = ARRAY[]::TEXT[] WHERE "equipment" IS NULL;
ALTER TABLE "Space" ALTER COLUMN "equipment" SET NOT NULL;

UPDATE "UserIdentity" SET "permissions" = ARRAY[]::TEXT[] WHERE "permissions" IS NULL;
ALTER TABLE "UserIdentity" ALTER COLUMN "permissions" SET NOT NULL;

UPDATE "UserNotificationPreference" SET "mutedTypes" = ARRAY[]::TEXT[] WHERE "mutedTypes" IS NULL;
ALTER TABLE "UserNotificationPreference" ALTER COLUMN "mutedTypes" SET NOT NULL;
