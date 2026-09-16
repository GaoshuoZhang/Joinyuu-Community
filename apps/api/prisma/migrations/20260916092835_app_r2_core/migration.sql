-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "expireAt" VARCHAR(16),
ADD COLUMN     "link" VARCHAR(128);

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CommunityEvent" ADD COLUMN     "cancelDeadlineHours" INTEGER DEFAULT 24,
ADD COLUMN     "checkinCloseMin" INTEGER DEFAULT 30,
ADD COLUMN     "checkinOpenMin" INTEGER DEFAULT 30,
ADD COLUMN     "checkinRadiusM" INTEGER DEFAULT 200,
ADD COLUMN     "rescheduledTo" VARCHAR(16),
ADD COLUMN     "venueLat" VARCHAR(32),
ADD COLUMN     "venueLng" VARCHAR(32);

-- AlterTable
ALTER TABLE "Demand" ADD COLUMN     "bottleneck" VARCHAR(255),
ADD COLUMN     "cooperationNeed" VARCHAR(255),
ADD COLUMN     "deliverBy" VARCHAR(16),
ADD COLUMN     "deliverable" VARCHAR(255),
ADD COLUMN     "demandType" VARCHAR(16) NOT NULL DEFAULT 'task',
ADD COLUMN     "partnershipMode" VARCHAR(128),
ADD COLUMN     "returnOffer" VARCHAR(255);

-- AlterTable
ALTER TABLE "DemandRespondent" ADD COLUMN     "rejectReason" VARCHAR(255),
ADD COLUMN     "responderIdentity" JSONB,
ADD COLUMN     "reviewAt" VARCHAR(16),
ADD COLUMN     "userId" VARCHAR(16),
ADD COLUMN     "withdrawnAt" VARCHAR(16);

-- AlterTable
ALTER TABLE "EventEnrollment" ADD COLUMN     "checkinLat" VARCHAR(32),
ADD COLUMN     "checkinLng" VARCHAR(32),
ADD COLUMN     "checkinMethod" VARCHAR(16),
ADD COLUMN     "waitlistOrder" INTEGER,
ADD COLUMN     "waitlisted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MallGoods" ADD COLUMN     "fulfillment" VARCHAR(16) NOT NULL DEFAULT 'physical';

-- Q1 存量回填：旧 category 同时承载履约类型，先拆出 fulfillment，再改写为 goods_category 编码。
UPDATE "MallGoods"
SET "fulfillment" = CASE
  WHEN "category" IN ('虚拟服务', 'virtual') THEN 'service'
  WHEN "category" IN ('权益券', 'voucher') THEN 'voucher'
  ELSE 'physical'
END;

UPDATE "MallGoods"
SET "category" = CASE
  WHEN "category" IN ('实物商品', 'physical') THEN 'GC001'
  WHEN "category" IN ('虚拟服务', 'virtual') THEN 'GC002'
  WHEN "category" IN ('权益券', 'voucher') THEN 'GC003'
  ELSE "category"
END;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "acceptAt" VARCHAR(16),
ADD COLUMN     "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "returnReason" VARCHAR(255),
ADD COLUMN     "returnedAt" VARCHAR(16),
ADD COLUMN     "submitAt" VARCHAR(16);

-- AlterTable
ALTER TABLE "RedemptionOrder" ADD COLUMN     "addressId" VARCHAR(16),
ADD COLUMN     "cancelledAt" VARCHAR(16),
ADD COLUMN     "fulfillment" VARCHAR(16) NOT NULL DEFAULT 'physical',
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "reviewComment" VARCHAR(500),
ADD COLUMN     "trackingNo" VARCHAR(64),
ADD COLUMN     "usedAt" VARCHAR(16),
ADD COLUMN     "voucherCode" VARCHAR(64),
ADD COLUMN     "voucherExpiresAt" VARCHAR(16);

-- 既有订单按商品回填履约类型，保留原状态机历史。
UPDATE "RedemptionOrder" AS ro
SET "fulfillment" = g."fulfillment"
FROM "MallGoods" AS g
WHERE ro."goodsId" = g."id";

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "advanceDays" INTEGER,
ADD COLUMN     "maxHours" INTEGER,
ADD COLUMN     "openHours" JSONB;

-- AlterTable
ALTER TABLE "SpaceReservation" ADD COLUMN     "asEnterpriseId" VARCHAR(16),
ADD COLUMN     "identityType" VARCHAR(24),
ADD COLUMN     "subjectName" VARCHAR(64);

-- CreateTable
CREATE TABLE "DemandMessage" (
    "id" SERIAL NOT NULL,
    "demandId" VARCHAR(16) NOT NULL,
    "senderId" VARCHAR(16) NOT NULL,
    "senderName" VARCHAR(64) NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "DemandMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" SERIAL NOT NULL,
    "projectId" VARCHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "assignee" VARCHAR(64),
    "status" VARCHAR(8) NOT NULL DEFAULT 'todo',
    "duedAt" VARCHAR(16),
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" SERIAL NOT NULL,
    "projectId" VARCHAR(16) NOT NULL,
    "storeKey" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaderId" VARCHAR(16) NOT NULL,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDiscussion" (
    "id" SERIAL NOT NULL,
    "projectId" VARCHAR(16) NOT NULL,
    "senderId" VARCHAR(16) NOT NULL,
    "senderName" VARCHAR(64) NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "ProjectDiscussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTicket" (
    "id" SERIAL NOT NULL,
    "eventId" VARCHAR(16) NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "ticketNo" VARCHAR(32) NOT NULL,
    "redeemCode" VARCHAR(16) NOT NULL,
    "redeemedAt" VARCHAR(16),

    CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFeedback" (
    "id" SERIAL NOT NULL,
    "eventId" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500) NOT NULL,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "EventFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockSubscribe" (
    "id" SERIAL NOT NULL,
    "goodsId" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "notifiedAt" VARCHAR(16),
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "RestockSubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(16) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleComment" (
    "id" SERIAL NOT NULL,
    "articleId" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "userName" VARCHAR(64) NOT NULL,
    "content" VARCHAR(200) NOT NULL,
    "at" VARCHAR(16) NOT NULL,

    CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandMessage_demandId_idx" ON "DemandMessage"("demandId");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDiscussion_projectId_idx" ON "ProjectDiscussion"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTicket_enrollmentId_key" ON "EventTicket"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTicket_ticketNo_key" ON "EventTicket"("ticketNo");

-- CreateIndex
CREATE INDEX "EventTicket_eventId_idx" ON "EventTicket"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFeedback_eventId_userId_key" ON "EventFeedback"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RestockSubscribe_goodsId_userId_key" ON "RestockSubscribe"("goodsId", "userId");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_targetType_targetId_key" ON "Favorite"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ArticleComment_articleId_at_idx" ON "ArticleComment"("articleId", "at");

-- CreateIndex
CREATE INDEX "ArticleComment_userId_idx" ON "ArticleComment"("userId");

-- CreateTable: configurable application-form schemas
CREATE TABLE "ApplicationFormConfig" (
    "type" VARCHAR(16) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "subtitle" VARCHAR(255) NOT NULL,
    "submitLabel" VARCHAR(64) NOT NULL,
    "tips" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" VARCHAR(16) NOT NULL,
    CONSTRAINT "ApplicationFormConfig_pkey" PRIMARY KEY ("type")
);

-- CreateIndex
CREATE INDEX "Demand_demandType_idx" ON "Demand"("demandType");

-- CreateIndex
CREATE INDEX "DemandRespondent_userId_idx" ON "DemandRespondent"("userId");

-- AddForeignKey
ALTER TABLE "DemandRespondent" ADD CONSTRAINT "DemandRespondent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandMessage" ADD CONSTRAINT "DemandMessage_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDiscussion" ADD CONSTRAINT "ProjectDiscussion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
