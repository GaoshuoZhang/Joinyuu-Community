-- 轮播图管理菜单权限（内容管理）；种子目录同步于 seed-data/rbac.ts
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES
  ('/contents/banners', '轮播图管理', '内容管理', 'menu', 55)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "module" = EXCLUDED."module", "authType" = EXCLUDED."authType", "sort" = EXCLUDED."sort";

INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT r."id", '/contents/banners' FROM "AdminRole" r WHERE r."id" = 'R2'
ON CONFLICT DO NOTHING;
