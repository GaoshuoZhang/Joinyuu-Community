-- 用户留言接入归档体系（同需求/投稿等域）：新增 archivableAt/deletedAt/deletedBy 与索引。
-- archivableAt 在留言被回复（replied）时写入，供「归档管理 > 用户留言」自动归档按延时判定。
ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "archivableAt" VARCHAR(16);
ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "deletedAt" VARCHAR(16);
ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "deletedBy" VARCHAR(64);

CREATE INDEX "UserMessage_archivableAt_idx" ON "UserMessage"("archivableAt");
CREATE INDEX "UserMessage_deletedAt_idx" ON "UserMessage"("deletedAt");

-- 历史已回复留言补写 archivableAt，使自动归档对存量数据同样生效
UPDATE "UserMessage" SET "archivableAt" = "repliedAt" WHERE "status" = 'replied' AND "repliedAt" IS NOT NULL AND "archivableAt" IS NULL;
