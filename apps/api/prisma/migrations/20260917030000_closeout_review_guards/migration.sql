-- Legacy duplicates cannot safely express one deletion intent: withdraw all of
-- them and let the member submit a new request with a fresh cooling-off period.
UPDATE "AccountDeletionRequest"
SET "status" = 'cancelled',
    "cancelledAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI'),
    "cancelReason" = '重复注销申请已撤销，如仍需注销请重新提交'
WHERE "status" = 'cooling' AND "userId" IN (
  SELECT "userId" FROM "AccountDeletionRequest"
  WHERE "status" = 'cooling' GROUP BY "userId" HAVING COUNT(*) > 1
);
CREATE UNIQUE INDEX "AccountDeletionRequest_one_cooling_per_user"
  ON "AccountDeletionRequest" ("userId") WHERE "status" = 'cooling';

ALTER TABLE "User" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Enterprise" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Demand" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Article" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Report"
  ADD COLUMN "action" VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN "targetModerationVersion" INTEGER,
  ADD COLUMN "restoredAt" VARCHAR(16);

-- Cover all writers (including scheduling, archive/restore and manual operations).
-- Even reasserting the same status is a new moderation decision. Unrelated edits
-- and view counters do not invalidate a legitimate report recovery.
CREATE FUNCTION bump_moderation_version() RETURNS trigger AS $$
BEGIN
  NEW."moderationVersion" := OLD."moderationVersion" + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "User_moderation_version" BEFORE UPDATE OF "status", "frozenUntil", "frozenReason"
  ON "User" FOR EACH ROW EXECUTE FUNCTION bump_moderation_version();
CREATE TRIGGER "Enterprise_moderation_version" BEFORE UPDATE OF "showcaseStatus", "status", "deletedAt"
  ON "Enterprise" FOR EACH ROW EXECUTE FUNCTION bump_moderation_version();
CREATE TRIGGER "Demand_moderation_version" BEFORE UPDATE OF "status", "deletedAt"
  ON "Demand" FOR EACH ROW EXECUTE FUNCTION bump_moderation_version();
CREATE TRIGGER "Article_moderation_version" BEFORE UPDATE OF "status", "deletedAt"
  ON "Article" FOR EACH ROW EXECUTE FUNCTION bump_moderation_version();
