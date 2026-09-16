-- Keep the runtime permission catalog aligned with GovernanceController.
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort")
VALUES ('/governance', '信任治理', '系统管理', 'menu', 91)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "authType" = EXCLUDED."authType", "sort" = EXCLUDED."sort";

-- The seeded audit role owns trust-governance review work. Super administrators
-- retain access through their existing '*' permission.
INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT 'R3', '/governance'
WHERE EXISTS (SELECT 1 FROM "AdminRole" WHERE "id" = 'R3')
ON CONFLICT ("roleId", "permissionCode") DO NOTHING;
