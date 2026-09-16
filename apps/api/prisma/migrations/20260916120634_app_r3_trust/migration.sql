-- AlterTable
ALTER TABLE "Enterprise" ADD COLUMN     "address" VARCHAR(255),
ADD COLUMN     "advantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "logo" VARCHAR(255),
ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "website" VARCHAR(255);

-- AlterTable
ALTER TABLE "Favorite" ADD COLUMN     "subtitle" VARCHAR(128),
ADD COLUMN     "title" VARCHAR(128) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "realnameRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserIdentity" ADD COLUMN     "memberPhone" VARCHAR(32),
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Report" (
    "id" VARCHAR(16) NOT NULL,
    "reporterId" VARCHAR(16) NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(16) NOT NULL,
    "targetTitle" VARCHAR(128) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "detail" VARCHAR(500),
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "at" VARCHAR(16) NOT NULL,
    "handledAt" VARCHAR(16),
    "handledBy" VARCHAR(64),
    "resolution" VARCHAR(255),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" SERIAL NOT NULL,
    "appellantId" VARCHAR(16) NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdAt" VARCHAR(16) NOT NULL,
    "handledAt" VARCHAR(16),
    "handledBy" VARCHAR(64),
    "resolution" VARCHAR(255),

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "blockedUid" VARCHAR(16) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseInvitation" (
    "id" VARCHAR(16) NOT NULL,
    "enterpriseId" VARCHAR(16) NOT NULL,
    "inviterId" VARCHAR(16) NOT NULL,
    "inviteeUid" VARCHAR(16) NOT NULL,
    "memberName" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "role" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdAt" VARCHAR(16) NOT NULL,
    "expiresAt" VARCHAR(16) NOT NULL,
    "respondedAt" VARCHAR(16),

    CONSTRAINT "EnterpriseInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferRequest" (
    "id" VARCHAR(16) NOT NULL,
    "enterpriseId" VARCHAR(16) NOT NULL,
    "fromUserId" VARCHAR(16) NOT NULL,
    "toUserId" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdAt" VARCHAR(16) NOT NULL,
    "expiresAt" VARCHAR(16) NOT NULL,
    "respondedAt" VARCHAR(16),

    CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "category" VARCHAR(32) NOT NULL DEFAULT '-',
    "title" VARCHAR(128) NOT NULL,
    "summary" VARCHAR(255) NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "version" VARCHAR(32) NOT NULL DEFAULT '1.0',
    "effectiveAt" VARCHAR(16),
    "publisher" VARCHAR(64) NOT NULL DEFAULT '聚屿社区',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(16) NOT NULL DEFAULT 'published',
    "publishedAt" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualCard" (
    "userId" VARCHAR(16) NOT NULL,
    "intro" VARCHAR(500) NOT NULL DEFAULT '',
    "industryExperience" VARCHAR(255),
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age" INTEGER,
    "politicalStatus" VARCHAR(16),
    "education" JSONB NOT NULL DEFAULT '[]',
    "work" JSONB NOT NULL DEFAULT '[]',
    "projects" JSONB NOT NULL DEFAULT '[]',
    "honors" JSONB NOT NULL DEFAULT '[]',
    "socials" JSONB NOT NULL DEFAULT '[]',
    "customLinks" JSONB NOT NULL DEFAULT '[]',
    "visibility" JSONB NOT NULL DEFAULT '{"age":true,"politicalStatus":true}',
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "IndividualCard_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Report_reporterId_status_idx" ON "Report"("reporterId", "status");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_appellantId_targetType_targetId_key" ON "Appeal"("appellantId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Appeal_status_createdAt_idx" ON "Appeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserBlock_userId_idx" ON "UserBlock"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_userId_blockedUid_key" ON "UserBlock"("userId", "blockedUid");

-- CreateIndex
CREATE INDEX "EnterpriseInvitation_enterpriseId_idx" ON "EnterpriseInvitation"("enterpriseId");

-- CreateIndex
CREATE INDEX "EnterpriseInvitation_inviteeUid_status_expiresAt_idx" ON "EnterpriseInvitation"("inviteeUid", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "EnterpriseInvitation_phone_idx" ON "EnterpriseInvitation"("phone");

-- CreateIndex
CREATE INDEX "TransferRequest_toUserId_status_idx" ON "TransferRequest"("toUserId", "status");

-- CreateIndex
CREATE INDEX "TransferRequest_enterpriseId_idx" ON "TransferRequest"("enterpriseId");

-- CreateIndex
CREATE INDEX "Policy_kind_status_idx" ON "Policy"("kind", "status");

-- CreateIndex
CREATE INDEX "Policy_category_status_effectiveAt_idx" ON "Policy"("category", "status", "effectiveAt");

-- Pending invitations/transfers must remain unique under concurrent requests.
CREATE UNIQUE INDEX "EnterpriseInvitation_pending_enterprise_invitee_key"
ON "EnterpriseInvitation"("enterpriseId", "inviteeUid") WHERE "status" = 'pending';

CREATE UNIQUE INDEX "TransferRequest_pending_enterprise_key"
ON "TransferRequest"("enterpriseId") WHERE "status" = 'pending';

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_appellantId_fkey" FOREIGN KEY ("appellantId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualCard" ADD CONSTRAINT "IndividualCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
