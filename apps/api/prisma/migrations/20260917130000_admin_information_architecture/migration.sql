-- Retire the review-only showcase workflow. Enterprise.showcaseStatus remains the
-- public-card visibility and governance state, so it is intentionally retained.
DROP TABLE IF EXISTS "ShowcaseRequest";
ALTER TABLE "Enterprise" DROP COLUMN IF EXISTS "showcaseComment";

-- Existing identity snapshots may have been saved against the former global
-- ladder. Recompute the individual scope before enforcing scoped limits.
UPDATE "UserIdentity" i
SET "level" = COALESCE((
  SELECT t."level" FROM "LevelTier" t
  WHERE t."identityType" = 'community_individual' AND t."threshold" <= COALESCE(i."experience", 0)
  ORDER BY t."threshold" DESC LIMIT 1
), 1)
WHERE i."type" = 'community_individual';

-- Replace legacy task and real-name-right permissions with the new rule,
-- community-policy and agreement-management surfaces.
DELETE FROM "AdminRolePermission"
WHERE "permissionCode" IN ('/contents/showcase', '/engagement/tasks', '/engagement/rights');
DELETE FROM "AdminPermission"
WHERE "code" IN ('/contents/showcase', '/engagement/tasks', '/engagement/rights');

INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES
  ('/contents/policies', '社区政策', '内容管理', 'menu', 54),
  ('/rules/publishing-limits', '发布限制', '规则管理', 'menu', 75),
  ('/system/policies', '协议与政策', '系统管理', 'menu', 94)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "module" = EXCLUDED."module", "authType" = EXCLUDED."authType", "sort" = EXCLUDED."sort";

INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT r."id", p."code" FROM "AdminRole" r CROSS JOIN "AdminPermission" p
WHERE r."id" = 'R2' AND p."code" IN ('/contents/policies', '/rules/publishing-limits')
ON CONFLICT DO NOTHING;
