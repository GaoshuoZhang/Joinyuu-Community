-- CreateTable
CREATE TABLE "UserNotification" (
    "id" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "content" VARCHAR(255) NOT NULL,
    "link" VARCHAR(128),
    "at" VARCHAR(16) NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "userId" VARCHAR(16) NOT NULL,
    "enabledTypes" JSONB NOT NULL DEFAULT '["all"]',
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "region" VARCHAR(128) NOT NULL,
    "detail" VARCHAR(255) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementConsent" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "agreementType" VARCHAR(32) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "consentedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "AgreementConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'cooling',
    "requestedAt" VARCHAR(16) NOT NULL,
    "effectiveAt" VARCHAR(16),
    "cancelReason" VARCHAR(255),
    "cancelledAt" VARCHAR(16),
    "approvedAt" VARCHAR(16),

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_read_idx" ON "UserNotification"("userId", "read");

-- CreateIndex
CREATE INDEX "UserNotification_userId_archived_idx" ON "UserNotification"("userId", "archived");

-- CreateIndex
CREATE INDEX "UserNotification_userId_type_idx" ON "UserNotification"("userId", "type");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "AgreementConsent_userId_idx" ON "AgreementConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementConsent_userId_agreementType_key" ON "AgreementConsent"("userId", "agreementType");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_userId_idx" ON "AccountDeletionRequest"("userId");
