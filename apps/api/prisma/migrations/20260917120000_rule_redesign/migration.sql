-- Remove the claimable task-center. PointsRule remains the fixed automatic catalogue.
DROP TABLE IF EXISTS "UserTaskRecord";
DROP TABLE IF EXISTS "PointsTask";

-- Level thresholds are independent for community individuals and enterprises.
ALTER TABLE "LevelTier" ADD COLUMN "identityType" VARCHAR(32) NOT NULL DEFAULT 'community_individual';
ALTER TABLE "LevelTier" DROP CONSTRAINT "LevelTier_pkey";
ALTER TABLE "LevelTier" ADD CONSTRAINT "LevelTier_pkey" PRIMARY KEY ("identityType", "level");
INSERT INTO "LevelTier" ("identityType", "level", "label", "threshold")
SELECT 'community_enterprise', "level", "label", "threshold"
FROM "LevelTier"
WHERE "identityType" = 'community_individual';

-- Old rights counters combined unrelated actions and could not represent an enterprise subject.
DROP TABLE IF EXISTS "RightsUsage";
DROP TABLE IF EXISTS "RightsRule";

CREATE TABLE "PublishingLimitRule" (
  "identityType" VARCHAR(32) NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 0,
  "action" VARCHAR(32) NOT NULL,
  "dailyLimit" INTEGER NOT NULL DEFAULT -1,
  CONSTRAINT "PublishingLimitRule_pkey" PRIMARY KEY ("identityType", "level", "action")
);

CREATE TABLE "PublishingLimitUsage" (
  "subjectType" VARCHAR(16) NOT NULL,
  "subjectId" VARCHAR(16) NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PublishingLimitUsage_pkey" PRIMARY KEY ("subjectType", "subjectId", "action", "date")
);

INSERT INTO "PublishingLimitRule" ("identityType", "level", "action", "dailyLimit") VALUES
  ('personal_unverified', 0, 'demand_publish', 1),
  ('personal_unverified', 0, 'article_publish', 1),
  ('personal_unverified', 0, 'event_enroll', 1),
  ('personal_unverified', 0, 'space_reserve', 0),
  ('personal_verified', 0, 'demand_publish', 3),
  ('personal_verified', 0, 'article_publish', 2),
  ('personal_verified', 0, 'event_enroll', 3),
  ('personal_verified', 0, 'space_reserve', 1);

INSERT INTO "PublishingLimitRule" ("identityType", "level", "action", "dailyLimit")
SELECT t."identityType", t."level", a.action,
  CASE a.action
    WHEN 'demand_publish' THEN 4 + t."level"
    WHEN 'article_publish' THEN 2 + t."level"
    WHEN 'event_enroll' THEN 4 + t."level"
    ELSE 1 + ((t."level" + 1) / 2)
  END
FROM "LevelTier" t
CROSS JOIN (VALUES ('demand_publish'), ('article_publish'), ('event_enroll'), ('space_reserve')) AS a(action);

-- Enterprise experience is authoritative for every identity representing that enterprise.
UPDATE "UserIdentity" i
SET "experience" = e."experience",
    "level" = COALESCE((
      SELECT t."level"
      FROM "LevelTier" t
      WHERE t."identityType" = 'community_enterprise' AND t."threshold" <= e."experience"
      ORDER BY t."threshold" DESC
      LIMIT 1
    ), 1)
FROM "Enterprise" e
WHERE i."type" = 'community_enterprise' AND i."enterpriseId" = e."id";
