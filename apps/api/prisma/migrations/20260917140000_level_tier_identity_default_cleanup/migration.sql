-- The split migration used a temporary default to backfill existing rows.
-- New tier rows must always declare their own identity scope.
ALTER TABLE "LevelTier" ALTER COLUMN "identityType" DROP DEFAULT;
