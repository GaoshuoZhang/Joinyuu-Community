-- 移除企业名片状态：社区企业不再区分名片发布状态
DROP TRIGGER IF EXISTS "Enterprise_moderation_version" ON "Enterprise";
ALTER TABLE "Enterprise" DROP COLUMN IF EXISTS "showcaseStatus";
CREATE TRIGGER "Enterprise_moderation_version" BEFORE UPDATE OF "status", "deletedAt"
  ON "Enterprise" FOR EACH ROW EXECUTE FUNCTION bump_moderation_version();
