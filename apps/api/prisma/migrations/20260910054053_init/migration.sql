-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdSequence" (
    "entityType" VARCHAR(32) NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "IdSequence_pkey" PRIMARY KEY ("entityType")
);

-- CreateTable
CREATE TABLE "User" (
    "uid" CHAR(16) NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(128) NOT NULL,
    "gender" VARCHAR(8) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "realName" VARCHAR(64),
    "citizenId" VARCHAR(32),
    "wechatOpenid" VARCHAR(64),
    "wechatUnionid" VARCHAR(64),
    "wechatVerified" BOOLEAN NOT NULL DEFAULT false,
    "frozenUntil" VARCHAR(16),
    "frozenReason" VARCHAR(255),
    "points" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" VARCHAR(16) NOT NULL,
    "lastActiveAt" VARCHAR(16) NOT NULL,
    "bio" TEXT NOT NULL,
    "activities" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "User_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" SERIAL NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "enterpriseId" CHAR(16),
    "enterpriseName" VARCHAR(128),
    "role" VARCHAR(16),
    "title" VARCHAR(64) NOT NULL,
    "level" INTEGER,
    "experience" INTEGER,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enterprise" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "industry" VARCHAR(64) NOT NULL,
    "stage" VARCHAR(32) NOT NULL,
    "size" VARCHAR(32) NOT NULL,
    "foundedAt" VARCHAR(16) NOT NULL,
    "settledAt" VARCHAR(16),
    "leaseType" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "showcaseStatus" VARCHAR(16) NOT NULL DEFAULT 'none',
    "showcaseComment" VARCHAR(255),
    "experience" INTEGER NOT NULL DEFAULT 0,
    "contactName" VARCHAR(64) NOT NULL,
    "contactPhone" VARCHAR(32) NOT NULL,
    "contactEmail" VARCHAR(128),
    "description" TEXT NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEnterpriseProfile" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "industry" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,
    "cooperationCount" INTEGER NOT NULL DEFAULT 0,
    "firstCooperationAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "ExternalEnterpriseProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" CHAR(16) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "applicantName" VARCHAR(64) NOT NULL,
    "applicantPhone" VARCHAR(32) NOT NULL,
    "targetName" VARCHAR(128) NOT NULL,
    "submittedAt" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '[]',
    "records" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" CHAR(16) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "publisherId" VARCHAR(16) NOT NULL DEFAULT '',
    "publisherName" VARCHAR(128) NOT NULL,
    "publisherIdentity" JSONB,
    "contactName" VARCHAR(64),
    "contactPhone" VARCHAR(32),
    "contactEmail" VARCHAR(128),
    "budget" VARCHAR(64) NOT NULL,
    "period" VARCHAR(32) NOT NULL,
    "deadline" VARCHAR(16) NOT NULL,
    "scheduledAt" VARCHAR(16),
    "visibilityIdentities" TEXT[],
    "visibilityLevels" TEXT[],
    "enrollmentIdentities" TEXT[],
    "enrollmentLevels" TEXT[],
    "status" VARCHAR(24) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,
    "publishedAt" VARCHAR(16),
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "rejectedReason" VARCHAR(255),
    "matchedRespondent" VARCHAR(128),
    "projectId" CHAR(16),
    "respondPoints" INTEGER,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandRespondent" (
    "id" SERIAL NOT NULL,
    "demandId" CHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "enterprise" VARCHAR(128) NOT NULL,
    "phone" VARCHAR(32),
    "email" VARCHAR(128),
    "quote" VARCHAR(64),
    "message" TEXT NOT NULL,
    "at" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',

    CONSTRAINT "DemandRespondent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startDate" VARCHAR(16) NOT NULL DEFAULT '',
    "endDate" VARCHAR(16) NOT NULL DEFAULT '',
    "initiatedAt" VARCHAR(16) NOT NULL,
    "description" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "sourceDemandId" CHAR(16),
    "expReward" INTEGER,
    "closeReason" VARCHAR(255),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUndertaker" (
    "id" SERIAL NOT NULL,
    "projectId" CHAR(16) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "refId" CHAR(16) NOT NULL DEFAULT '',
    "name" VARCHAR(128) NOT NULL,
    "share" INTEGER NOT NULL,
    "contactName" VARCHAR(64),
    "phone" VARCHAR(32),

    CONSTRAINT "ProjectUndertaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" SERIAL NOT NULL,
    "projectId" CHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'todo',
    "date" VARCHAR(16) NOT NULL,
    "owners" TEXT[],

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityEvent" (
    "id" CHAR(16) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "startTime" VARCHAR(16) NOT NULL,
    "endTime" VARCHAR(16) NOT NULL,
    "location" VARCHAR(128) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "speaker" VARCHAR(64) NOT NULL,
    "host" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "enrollmentOpen" BOOLEAN NOT NULL DEFAULT false,
    "visibilityIdentities" TEXT[],
    "visibilityLevels" TEXT[],
    "enrollmentIdentities" TEXT[],
    "enrollmentLevels" TEXT[],
    "requireReview" BOOLEAN NOT NULL DEFAULT false,
    "enrollmentDeadline" VARCHAR(16),
    "scheduledAt" VARCHAR(16),
    "enrollPoints" INTEGER,
    "checkinPoints" INTEGER,
    "description" TEXT NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventEnrollment" (
    "id" SERIAL NOT NULL,
    "eventId" CHAR(16) NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "enterprise" VARCHAR(128) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "appliedAt" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkInAt" VARCHAR(16),

    CONSTRAINT "EventEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceRecord" (
    "id" CHAR(16) NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(16) NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "at" VARCHAR(16) NOT NULL,
    "operator" VARCHAR(64) NOT NULL,
    "source" VARCHAR(16) NOT NULL,

    CONSTRAINT "ExperienceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsRecord" (
    "id" CHAR(16) NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "at" VARCHAR(16) NOT NULL,
    "operator" VARCHAR(64) NOT NULL,
    "source" VARCHAR(16) NOT NULL,

    CONSTRAINT "PointsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MallGoods" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "points" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'on',
    "description" TEXT NOT NULL,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "MallGoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionOrder" (
    "id" CHAR(16) NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "userName" VARCHAR(64) NOT NULL,
    "goodsId" CHAR(16) NOT NULL,
    "goodsName" VARCHAR(128) NOT NULL,
    "points" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,
    "shippedAt" VARCHAR(16),
    "finishedAt" VARCHAR(16),
    "recipientName" VARCHAR(64),
    "recipientPhone" VARCHAR(32),
    "address" VARCHAR(255),
    "note" VARCHAR(255),
    "cancelReason" VARCHAR(255),

    CONSTRAINT "RedemptionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsRule" (
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "scene" VARCHAR(255) NOT NULL,
    "points" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'enabled',
    "description" VARCHAR(255),
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "PointsRule_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ExperienceRule" (
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "scene" VARCHAR(255) NOT NULL,
    "exp" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'enabled',
    "description" VARCHAR(255),
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "ExperienceRule_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "LevelTier" (
    "level" INTEGER NOT NULL,
    "label" VARCHAR(32) NOT NULL,
    "threshold" INTEGER NOT NULL,

    CONSTRAINT "LevelTier_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "WorkstationArea" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "type" VARCHAR(8) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "WorkstationArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workstation" (
    "id" CHAR(16) NOT NULL,
    "seatNo" VARCHAR(32) NOT NULL,
    "areaId" CHAR(16) NOT NULL,
    "type" VARCHAR(8) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'idle',
    "enterpriseId" CHAR(16),
    "enterpriseName" VARCHAR(128),
    "leaseId" CHAR(16),
    "defaultMonthlyRent" INTEGER,
    "areaSqm" INTEGER,
    "note" VARCHAR(255),

    CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" CHAR(16) NOT NULL,
    "renterId" CHAR(16) NOT NULL DEFAULT '',
    "renterName" VARCHAR(128) NOT NULL,
    "renterType" VARCHAR(16) NOT NULL DEFAULT 'custom',
    "startDate" VARCHAR(16) NOT NULL,
    "endDate" VARCHAR(16) NOT NULL DEFAULT '',
    "longTerm" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(16) NOT NULL,
    "monthlyRent" INTEGER NOT NULL,
    "rentPeriod" VARCHAR(8) NOT NULL DEFAULT 'month',
    "contactName" VARCHAR(64) NOT NULL,
    "contactPhone" VARCHAR(32) NOT NULL,
    "terminatedAt" VARCHAR(16),

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseWorkstation" (
    "leaseId" CHAR(16) NOT NULL,
    "workstationId" CHAR(16) NOT NULL,

    CONSTRAINT "LeaseWorkstation_pkey" PRIMARY KEY ("leaseId","workstationId")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "location" VARCHAR(128) NOT NULL,
    "openTime" VARCHAR(8) NOT NULL,
    "closeTime" VARCHAR(8) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "needReservation" BOOLEAN NOT NULL DEFAULT false,
    "needApproval" BOOLEAN NOT NULL DEFAULT false,
    "equipment" TEXT[],
    "status" VARCHAR(16) NOT NULL DEFAULT 'available',
    "description" TEXT NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceReservation" (
    "id" CHAR(16) NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "userName" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "spaceId" CHAR(16) NOT NULL,
    "spaceName" VARCHAR(64) NOT NULL,
    "date" VARCHAR(16) NOT NULL,
    "startTime" VARCHAR(8) NOT NULL,
    "endTime" VARCHAR(8) NOT NULL,
    "purpose" VARCHAR(255) NOT NULL,
    "attendees" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "submittedAt" VARCHAR(16) NOT NULL,
    "records" JSONB NOT NULL DEFAULT '[]',
    "rejectReason" VARCHAR(255),

    CONSTRAINT "SpaceReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" CHAR(16) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "columnId" CHAR(16) NOT NULL,
    "columnName" VARCHAR(64) NOT NULL,
    "authorId" CHAR(16) NOT NULL,
    "authorName" VARCHAR(64) NOT NULL,
    "authorIdentity" JSONB,
    "status" VARCHAR(16) NOT NULL,
    "publishedAt" VARCHAR(16),
    "views" INTEGER NOT NULL DEFAULT 0,
    "summary" VARCHAR(255) NOT NULL,
    "tags" TEXT[],
    "createdAt" VARCHAR(16) NOT NULL,
    "rejectedReason" VARCHAR(255),

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleColumn" (
    "id" CHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "sort" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'enabled',
    "createdAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "ArticleColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseRequest" (
    "id" CHAR(16) NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" CHAR(16),
    "targetName" VARCHAR(128) NOT NULL,
    "contentSummary" VARCHAR(255) NOT NULL,
    "submitterName" VARCHAR(64) NOT NULL,
    "submitterPhone" VARCHAR(32) NOT NULL,
    "submittedAt" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "records" JSONB NOT NULL DEFAULT '[]',
    "rejectReason" VARCHAR(255),

    CONSTRAINT "ShowcaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" CHAR(16) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(16) NOT NULL DEFAULT 'published',
    "publishedAt" VARCHAR(16) NOT NULL,
    "createdAt" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" CHAR(16) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "content" VARCHAR(255) NOT NULL,
    "at" VARCHAR(16) NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" VARCHAR(128),

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" CHAR(16) NOT NULL,
    "operator" VARCHAR(64) NOT NULL,
    "module" VARCHAR(16) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "target" VARCHAR(255) NOT NULL,
    "detail" VARCHAR(255),
    "at" VARCHAR(16) NOT NULL,
    "ip" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "siteName" VARCHAR(64) NOT NULL,
    "siteSlogan" VARCHAR(128) NOT NULL,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "mallOpen" BOOLEAN NOT NULL DEFAULT true,
    "demandOpen" BOOLEAN NOT NULL DEFAULT true,
    "reservationOpen" BOOLEAN NOT NULL DEFAULT true,
    "dailyLoginPoints" BOOLEAN NOT NULL DEFAULT false,
    "leaseExpireRemindDays" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" VARCHAR(16) NOT NULL,
    "updatedBy" VARCHAR(64) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictEntry" (
    "type" VARCHAR(32) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "sort" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'enabled',

    CONSTRAINT "DictEntry_pkey" PRIMARY KEY ("type","code")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UserIdentity_type_enterpriseId_idx" ON "UserIdentity"("type", "enterpriseId");

-- CreateIndex
CREATE INDEX "UserIdentity_type_enterpriseName_idx" ON "UserIdentity"("type", "enterpriseName");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_userId_type_enterpriseId_key" ON "UserIdentity"("userId", "type", "enterpriseId");

-- CreateIndex
CREATE INDEX "Enterprise_status_idx" ON "Enterprise"("status");

-- CreateIndex
CREATE INDEX "Enterprise_industry_idx" ON "Enterprise"("industry");

-- CreateIndex
CREATE INDEX "ExternalEnterpriseProfile_name_idx" ON "ExternalEnterpriseProfile"("name");

-- CreateIndex
CREATE INDEX "Application_status_type_idx" ON "Application"("status", "type");

-- CreateIndex
CREATE INDEX "Demand_status_idx" ON "Demand"("status");

-- CreateIndex
CREATE INDEX "Demand_publisherId_idx" ON "Demand"("publisherId");

-- CreateIndex
CREATE INDEX "Demand_category_idx" ON "Demand"("category");

-- CreateIndex
CREATE INDEX "DemandRespondent_demandId_idx" ON "DemandRespondent"("demandId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "ProjectUndertaker_projectId_idx" ON "ProjectUndertaker"("projectId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");

-- CreateIndex
CREATE INDEX "CommunityEvent_status_idx" ON "CommunityEvent"("status");

-- CreateIndex
CREATE INDEX "CommunityEvent_startTime_idx" ON "CommunityEvent"("startTime");

-- CreateIndex
CREATE INDEX "EventEnrollment_userId_idx" ON "EventEnrollment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventEnrollment_eventId_userId_key" ON "EventEnrollment"("eventId", "userId");

-- CreateIndex
CREATE INDEX "ExperienceRecord_targetType_targetId_idx" ON "ExperienceRecord"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "PointsRecord_userId_idx" ON "PointsRecord"("userId");

-- CreateIndex
CREATE INDEX "PointsRecord_source_idx" ON "PointsRecord"("source");

-- CreateIndex
CREATE INDEX "MallGoods_status_idx" ON "MallGoods"("status");

-- CreateIndex
CREATE INDEX "RedemptionOrder_status_idx" ON "RedemptionOrder"("status");

-- CreateIndex
CREATE INDEX "RedemptionOrder_userId_idx" ON "RedemptionOrder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkstationArea_name_key" ON "WorkstationArea"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Workstation_seatNo_key" ON "Workstation"("seatNo");

-- CreateIndex
CREATE INDEX "Workstation_status_idx" ON "Workstation"("status");

-- CreateIndex
CREATE INDEX "Workstation_areaId_idx" ON "Workstation"("areaId");

-- CreateIndex
CREATE INDEX "Lease_status_idx" ON "Lease"("status");

-- CreateIndex
CREATE INDEX "LeaseWorkstation_workstationId_idx" ON "LeaseWorkstation"("workstationId");

-- CreateIndex
CREATE INDEX "SpaceReservation_spaceId_date_status_idx" ON "SpaceReservation"("spaceId", "date", "status");

-- CreateIndex
CREATE INDEX "SpaceReservation_userId_idx" ON "SpaceReservation"("userId");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_columnId_idx" ON "Article"("columnId");

-- CreateIndex
CREATE INDEX "AdminNotification_read_idx" ON "AdminNotification"("read");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "DictEntry_type_sort_idx" ON "DictEntry"("type", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "DictEntry_label_key" ON "DictEntry"("label");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandRespondent" ADD CONSTRAINT "DemandRespondent_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUndertaker" ADD CONSTRAINT "ProjectUndertaker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEnrollment" ADD CONSTRAINT "EventEnrollment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEnrollment" ADD CONSTRAINT "EventEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsRecord" ADD CONSTRAINT "PointsRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionOrder" ADD CONSTRAINT "RedemptionOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "WorkstationArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseWorkstation" ADD CONSTRAINT "LeaseWorkstation_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseWorkstation" ADD CONSTRAINT "LeaseWorkstation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceReservation" ADD CONSTRAINT "SpaceReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
