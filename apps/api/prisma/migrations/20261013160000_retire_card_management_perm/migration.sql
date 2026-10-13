-- 「名片管理」页下线（个人/企业名片编辑并入个体/企业详情页的名片标签页）：
-- 权限码 /card-management 退休，同时清理既有角色在该码上的授权（后端改为 /users、/enterprises 鉴权）。
DELETE FROM "AdminRolePermission" WHERE "permissionCode" = '/card-management';
DELETE FROM "AdminPermission" WHERE "code" = '/card-management';
