-- CreateTable
CREATE TABLE "PointsTask" (
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "condition" VARCHAR(16) NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PointsTask_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "UserTaskRecord" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "taskCode" VARCHAR(32) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "points" INTEGER NOT NULL,
    "claimedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "UserTaskRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceApplication" (
    "id" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "policyId" VARCHAR(16) NOT NULL,
    "policyTitle" VARCHAR(128) NOT NULL,
    "serviceType" VARCHAR(32) NOT NULL,
    "applicantName" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "receipt" VARCHAR(255),
    "assignee" VARCHAR(64),
    "at" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16) NOT NULL,
    "urgedAt" TIMESTAMP(3),
    "urgeCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" SERIAL NOT NULL,
    "eventType" VARCHAR(32) NOT NULL,
    "userId" VARCHAR(16),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RightsRule" (
    "tier" VARCHAR(32) NOT NULL,
    "minLevel" INTEGER NOT NULL DEFAULT 0,
    "publishLimit" INTEGER NOT NULL DEFAULT -1,
    "enrollLimit" INTEGER NOT NULL DEFAULT -1,
    "reserveLimit" INTEGER NOT NULL DEFAULT -1,

    CONSTRAINT "RightsRule_pkey" PRIMARY KEY ("tier")
);

-- CreateTable
CREATE TABLE "RightsUsage" (
    "userId" VARCHAR(16) NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RightsUsage_pkey" PRIMARY KEY ("userId","action","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTaskRecord_userId_taskCode_date_key" ON "UserTaskRecord"("userId", "taskCode", "date");

-- CreateIndex
CREATE INDEX "ServiceApplication_status_at_idx" ON "ServiceApplication"("status", "at");

-- CreateIndex
CREATE INDEX "ServiceApplication_userId_at_idx" ON "ServiceApplication"("userId", "at");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventType_at_idx" ON "AnalyticsEvent"("eventType", "at");

-- AddForeignKey
ALTER TABLE "UserTaskRecord" ADD CONSTRAINT "UserTaskRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTaskRecord" ADD CONSTRAINT "UserTaskRecord_taskCode_fkey" FOREIGN KEY ("taskCode") REFERENCES "PointsTask"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceApplication" ADD CONSTRAINT "ServiceApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RightsUsage" ADD CONSTRAINT "RightsUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PointsTask" ("code", "title", "description", "type", "condition", "points") VALUES
('publish', '发布一条需求', '发布需求并进入审核', 'once', 'publish', 10),
('respond', '响应一条需求', '提交一次需求响应', 'once', 'respond', 10),
('enroll', '报名一场活动', '报名社区活动', 'once', 'enroll', 10),
('order', '兑换一件商品', '在积分商城完成一次兑换', 'once', 'order', 5),
('favorite', '收藏一次内容', '收藏需求、文章、活动、企业或人才', 'once', 'favorite', 5);
INSERT INTO "RightsRule" ("tier") VALUES ('unverified'), ('verified');
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES
('/engagement/tasks', '积分任务', '系统管理', 'menu', 92),
('/engagement/services', '服务申请', '系统管理', 'menu', 93),
('/engagement/rights', '实名权益', '系统管理', 'menu', 94);
INSERT INTO "AdminRolePermission" ("roleId", "permissionCode")
SELECT r."id", p."code" FROM "AdminRole" r CROSS JOIN "AdminPermission" p
WHERE r."id" = 'R2' AND p."code" IN ('/engagement/tasks', '/engagement/services', '/engagement/rights')
ON CONFLICT DO NOTHING;
