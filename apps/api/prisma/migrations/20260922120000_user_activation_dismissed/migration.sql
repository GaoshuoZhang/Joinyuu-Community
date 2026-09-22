-- 新手任务永久隐藏：按账号持久化（跨浏览器/设备一致），默认显示。
ALTER TABLE "User" ADD COLUMN "activationDismissed" BOOLEAN NOT NULL DEFAULT false;
