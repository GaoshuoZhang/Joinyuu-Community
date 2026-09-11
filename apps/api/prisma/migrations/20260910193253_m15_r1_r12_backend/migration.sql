-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_authorId_fkey";

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "lastLoginAt" VARCHAR(16),
ADD COLUMN     "status" VARCHAR(16) NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "channel" VARCHAR(16) NOT NULL DEFAULT 'official',
ADD COLUMN     "content" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64),
ADD COLUMN     "scheduledAt" VARCHAR(16),
ALTER COLUMN "authorId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending_release';

-- AlterTable
ALTER TABLE "ArticleColumn" ADD COLUMN     "submissionOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommunityEvent" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "Demand" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "MallGoods" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" VARCHAR(16) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPermission" (
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "module" VARCHAR(32) NOT NULL,
    "authType" VARCHAR(8) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdminPermission_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "AdminUserRole" (
    "id" SERIAL NOT NULL,
    "adminUserId" INTEGER NOT NULL,
    "roleId" VARCHAR(16) NOT NULL,

    CONSTRAINT "AdminUserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" VARCHAR(16) NOT NULL,
    "permissionCode" VARCHAR(64) NOT NULL,

    CONSTRAINT "AdminRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginLog" (
    "id" VARCHAR(16) NOT NULL,
    "loginAt" VARCHAR(16) NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "ip" VARCHAR(64) NOT NULL,
    "device" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "failReason" VARCHAR(255),

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerLog" (
    "id" VARCHAR(16) NOT NULL,
    "jobName" VARCHAR(64) NOT NULL,
    "startedAt" VARCHAR(16) NOT NULL,
    "finishedAt" VARCHAR(16) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "detail" VARCHAR(255),
    "rowsAffected" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SchedulerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MallAsset" (
    "id" VARCHAR(32) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(64) NOT NULL,
    "size" INTEGER NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "storeKey" VARCHAR(255) NOT NULL,
    "bizType" VARCHAR(32),
    "createdBy" VARCHAR(64) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "MallAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_code_key" ON "AdminRole"("code");

-- CreateIndex
CREATE INDEX "AdminUserRole_roleId_idx" ON "AdminUserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUserRole_adminUserId_roleId_key" ON "AdminUserRole"("adminUserId", "roleId");

-- CreateIndex
CREATE INDEX "AdminRolePermission_permissionCode_idx" ON "AdminRolePermission"("permissionCode");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRolePermission_roleId_permissionCode_key" ON "AdminRolePermission"("roleId", "permissionCode");

-- CreateIndex
CREATE INDEX "LoginLog_loginAt_idx" ON "LoginLog"("loginAt");

-- CreateIndex
CREATE INDEX "LoginLog_status_idx" ON "LoginLog"("status");

-- CreateIndex
CREATE INDEX "SchedulerLog_jobName_startedAt_idx" ON "SchedulerLog"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "MallAsset_bizType_idx" ON "MallAsset"("bizType");

-- CreateIndex
CREATE INDEX "Article_channel_idx" ON "Article"("channel");
