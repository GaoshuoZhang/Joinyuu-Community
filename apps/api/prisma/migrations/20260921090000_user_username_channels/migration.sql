-- 用户身份增强：
-- 1) 新增 username（登录标识，全站唯一，仅字母/数字/下划线）
-- 2) phone/email 允许为空（邮箱注册无手机号、手机注册无邮箱），非空时全站唯一
-- 3) 新增 phoneVerifiedAt/emailVerifiedAt 标记「可信通知渠道」
-- 4) nickname 全站唯一
-- 5) Application 增 userId（「我的申请」按 uid 归属，不再依赖 applicantPhone）

-- ---------- username ----------
ALTER TABLE "User" ADD COLUMN "username" VARCHAR(32);
-- 历史数据按 uid 派生回填（user_u1001 形如，满足字母开头 + 唯一）
UPDATE "User" SET "username" = 'user_' || lower("uid") WHERE "username" IS NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- ---------- email：先解除 NOT NULL，再把空串归一为 NULL（唯一索引下空串仅允许一条），最后加唯一 ----------
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
UPDATE "User" SET "email" = NULL WHERE "email" IS NOT NULL AND btrim("email") = '';
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- ---------- phone：先解除 NOT NULL，再把空串归一为 NULL（既有唯一索引保留，Postgres 允许多 NULL） ----------
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
UPDATE "User" SET "phone" = NULL WHERE "phone" IS NOT NULL AND btrim("phone") = '';

-- ---------- 可信通知渠道标记：既有手机号/邮箱视为已验证 ----------
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" VARCHAR(16);
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" VARCHAR(16);
UPDATE "User" SET "phoneVerifiedAt" = "registeredAt" WHERE "phone" IS NOT NULL;
UPDATE "User" SET "emailVerifiedAt" = "registeredAt" WHERE "email" IS NOT NULL;

-- ---------- nickname 全站唯一 ----------
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");

-- ---------- Application.userId（归属「我的申请」） ----------
ALTER TABLE "Application" ADD COLUMN "userId" VARCHAR(16);
CREATE INDEX "Application_userId_idx" ON "Application"("userId");
-- 历史申请按申请人手机号回填 uid
UPDATE "Application" a
SET "userId" = u."uid"
FROM "User" u
WHERE u."phone" = a."applicantPhone" AND a."userId" IS NULL;
