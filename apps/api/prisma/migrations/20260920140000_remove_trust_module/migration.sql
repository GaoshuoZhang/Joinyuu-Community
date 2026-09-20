-- 移除举报与屏蔽模块（trust）：删除 Report / UserBlock 表、内容治理快照列与触发器，
-- 并将历史「举报治理下架」来源统一标记为手工下架。
DROP TRIGGER IF EXISTS "User_moderation_version" ON "User";
DROP TRIGGER IF EXISTS "Enterprise_moderation_version" ON "Enterprise";
DROP TRIGGER IF EXISTS "Demand_moderation_version" ON "Demand";
DROP TRIGGER IF EXISTS "Article_moderation_version" ON "Article";
DROP FUNCTION IF EXISTS bump_moderation_version();

UPDATE "ArticleTakedown" SET "source" = 'manual' WHERE "source" <> 'manual';
ALTER TABLE "ArticleTakedown" DROP COLUMN IF EXISTS "reportId";

DROP TABLE IF EXISTS "Report";
DROP TABLE IF EXISTS "UserBlock";

ALTER TABLE "User" DROP COLUMN IF EXISTS "moderationVersion";
ALTER TABLE "Enterprise" DROP COLUMN IF EXISTS "moderationVersion";
ALTER TABLE "Demand" DROP COLUMN IF EXISTS "moderationVersion";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "moderationVersion";
