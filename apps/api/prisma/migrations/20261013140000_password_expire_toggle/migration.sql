-- 密码过期强制改密开关（后台管理员账号专属，不影响客户端用户）：
--   1. SystemConfig.passwordExpireEnabled：默认 false = 密码永不过期；开启后按 passwordExpireDays 计算有效期。
--   2. 旧语义「passwordExpireDays=0 表示不启用」由开关取代：存量 0 值归一为默认 90 天，
--      避免管理员开启开关后读到非法的 0（接口校验已改为 1-3650）。
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "passwordExpireEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SystemConfig" SET "passwordExpireDays" = 90 WHERE "passwordExpireDays" < 1;