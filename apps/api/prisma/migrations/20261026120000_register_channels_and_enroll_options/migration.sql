-- 注册渠道开关（后台「系统配置 → 功能开关 → 客户端注册」下属开关）：默认开启；
-- 关闭后不允许使用该渠道注册新账号（已有账号仍可用该渠道验证码登录）；
-- 两个渠道均关闭时保存侧会同步关闭 registrationOpen（客户端注册整体暂停）。
ALTER TABLE "SystemConfig"
  ADD COLUMN IF NOT EXISTS "phoneRegisterOpen" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "emailRegisterOpen" BOOLEAN NOT NULL DEFAULT true;

-- 活动报名要求：报名需手机号 / 邮箱（未绑定时客户端引导绑定，服务端二次校验）；默认关闭
ALTER TABLE "CommunityEvent"
  ADD COLUMN IF NOT EXISTS "enrollRequirePhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enrollRequireEmail" BOOLEAN NOT NULL DEFAULT false;

-- 报名留言（客户端报名二次确认框填写，后台报名审核可见）
ALTER TABLE "EventEnrollment" ADD COLUMN IF NOT EXISTS "message" VARCHAR(200);
