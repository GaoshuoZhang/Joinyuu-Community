-- 站点 logo（后台左上角图标 + 浏览器标签页图标）；空串 = 使用内置默认字标
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "siteLogo" VARCHAR(512) NOT NULL DEFAULT '';
