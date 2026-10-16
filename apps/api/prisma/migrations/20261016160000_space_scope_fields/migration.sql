-- 公共空间「自定义可见范围 / 自定义可预约范围」（空数组 = 不限）。
-- 口径与 Demand 的 visibilityIdentities/visibilityLevels/enrollmentIdentities/enrollmentLevels 一致：
--   visibility*   客户端空间列表/详情按访客或登录用户的身份（+等级）过滤；
--   reservation*  客户端提交预约时校验（不命中 403）。
-- 等级仅对持有经验值的社区个体/社区企业身份生效。

ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "visibilityIdentities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "visibilityLevels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "reservationIdentities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "reservationLevels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
