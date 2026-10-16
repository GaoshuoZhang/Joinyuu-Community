-- 「响应审核」菜单权限（业务运营，紧随「需求审核」）；种子目录同步于 seed-data/rbac.ts。
-- 权限码目录校验（PermissionCatalogValidatorService）在启动时比对 AdminPermission 表，
-- 新控制器使用该码前必须先登记，否则启动即 fail fast。

INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES
  ('/demands/responses', '响应审核', '业务运营', 'menu', 32)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "module" = EXCLUDED."module", "authType" = EXCLUDED."authType", "sort" = EXCLUDED."sort";

-- 内置角色授权：运营（R2）与审核（R3）
INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT r."id", '/demands/responses' FROM "AdminRole" r WHERE r."id" IN ('R2', 'R3')
ON CONFLICT DO NOTHING;

-- 业务运营菜单排序顺延：响应审核插在需求审核之后
UPDATE "AdminPermission" SET "sort" = 33 WHERE "code" = '/projects';
UPDATE "AdminPermission" SET "sort" = 34 WHERE "code" = '/events';
