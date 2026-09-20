-- P0 消息中心：渠道配置 / 模板中心（版本化）/ Outbox 发送治理（幂等·重试·死信·投递日志）/ 渠道合规同意
-- 凭据只存环境变量名（credentialEnv），不落库明文；安静时段与渠道偏好在 UserNotificationPreference 上扩展。

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN     "channelPrefs" JSONB,
ADD COLUMN     "quietHoursEnd" VARCHAR(5),
ADD COLUMN     "quietHoursStart" VARCHAR(5);

-- CreateTable
CREATE TABLE "MessageChannel" (
    "id" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "credentialEnv" JSONB,
    "dailyLimit" INTEGER NOT NULL DEFAULT 0,
    "remark" VARCHAR(255),
    "createdAt" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16) NOT NULL,
    "updatedBy" VARCHAR(64) NOT NULL,

    CONSTRAINT "MessageChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" VARCHAR(16) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "category" VARCHAR(16) NOT NULL DEFAULT 'security',
    "variables" JSONB,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" VARCHAR(16) NOT NULL,
    "updatedBy" VARCHAR(64) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplateVersion" (
    "id" VARCHAR(16) NOT NULL,
    "templateId" VARCHAR(16) NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" VARCHAR(128),
    "body" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "reviewedBy" VARCHAR(64),
    "reviewedAt" VARCHAR(16),
    "reviewNote" VARCHAR(255),
    "createdBy" VARCHAR(64) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "MessageTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" VARCHAR(16) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "channelKind" VARCHAR(16) NOT NULL,
    "templateCode" VARCHAR(64) NOT NULL,
    "recipient" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(16),
    "payload" JSONB,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" VARCHAR(16),
    "lastError" VARCHAR(512),
    "providerMessageId" VARCHAR(128),
    "security" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16) NOT NULL,
    "sentAt" VARCHAR(16),

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDeliveryLog" (
    "id" VARCHAR(16) NOT NULL,
    "outboxId" VARCHAR(16) NOT NULL,
    "channelKind" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "recipient" VARCHAR(128) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "providerMessageId" VARCHAR(128),
    "error" VARCHAR(512),
    "costMs" INTEGER NOT NULL DEFAULT 0,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "MessageDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "channelKind" VARCHAR(16) NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "consented" BOOLEAN NOT NULL DEFAULT true,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageChannel_kind_enabled_idx" ON "MessageChannel"("kind", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MessageChannel_kind_provider_key" ON "MessageChannel"("kind", "provider");

-- CreateIndex
CREATE INDEX "MessageTemplate_kind_status_idx" ON "MessageTemplate"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_code_key" ON "MessageTemplate"("code");

-- CreateIndex
CREATE INDEX "MessageTemplateVersion_templateId_status_idx" ON "MessageTemplateVersion"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplateVersion_templateId_version_key" ON "MessageTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_channelKind_status_idx" ON "OutboxMessage"("channelKind", "status");

-- CreateIndex
CREATE INDEX "OutboxMessage_userId_createdAt_idx" ON "OutboxMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_idempotencyKey_key" ON "OutboxMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MessageDeliveryLog_outboxId_idx" ON "MessageDeliveryLog"("outboxId");

-- CreateIndex
CREATE INDEX "MessageDeliveryLog_channelKind_at_idx" ON "MessageDeliveryLog"("channelKind", "at");

-- CreateIndex
CREATE INDEX "ContactConsent_userId_idx" ON "ContactConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConsent_userId_channelKind_purpose_key" ON "ContactConsent"("userId", "channelKind", "purpose");

-- AddForeignKey
ALTER TABLE "MessageTemplateVersion" ADD CONSTRAINT "MessageTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
