-- 需求新增「公开联系人」开关：默认关闭。关闭时客户端（含未登录游客）不可见联系人姓名/电话/邮箱，后台始终可见。
ALTER TABLE "Demand" ADD COLUMN IF NOT EXISTS "contactPublic" BOOLEAN NOT NULL DEFAULT false;

-- 用户留言（M2-R R4）：客户端登录用户提交，后台「用户留言」页查看与回复。
CREATE TABLE "UserMessage" (
    "id" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,
    "replyContent" TEXT,
    "repliedAt" VARCHAR(16),
    "repliedBy" VARCHAR(64),

    CONSTRAINT "UserMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserMessage_userId_idx" ON "UserMessage"("userId");
CREATE INDEX "UserMessage_status_idx" ON "UserMessage"("status");
CREATE INDEX "UserMessage_createdAt_idx" ON "UserMessage"("createdAt");

-- 「用户留言」一级菜单权限（工作台，紧随工作台 sort=1）；种子目录同步于 seed-data/rbac.ts
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES
  ('/user-messages', '用户留言', '工作台', 'menu', 2)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "module" = EXCLUDED."module", "authType" = EXCLUDED."authType", "sort" = EXCLUDED."sort";

-- 授予「运营」角色（R2）：超管（R1）持 '*' 全量权限，无需逐条授权
INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT r."id", '/user-messages' FROM "AdminRole" r WHERE r."id" = 'R2'
ON CONFLICT DO NOTHING;
