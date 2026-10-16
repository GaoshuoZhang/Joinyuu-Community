-- 日志保留期（天）：对应「日志与审计」页右上角「日志设置」。
-- 0 = 永久保存（定时任务对对应表跳过清理）；默认 180 天。
-- 清理由定时任务 log-retention-purge 执行（apps/api/src/modules/system/log-retention.service.ts）。

ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "loginLogRetentionDays" INTEGER NOT NULL DEFAULT 180;
