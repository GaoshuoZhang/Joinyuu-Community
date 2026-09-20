-- O-05：移除无路由/无权能实现的遗留权限码「/governance（信任治理）」及其角色关联。
DELETE FROM "AdminRolePermission" WHERE "permissionCode" = '/governance';
DELETE FROM "AdminPermission" WHERE "code" = '/governance';
