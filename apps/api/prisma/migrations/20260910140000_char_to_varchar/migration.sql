-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_authorId_fkey";

-- DropForeignKey
ALTER TABLE "DemandRespondent" DROP CONSTRAINT "DemandRespondent_demandId_fkey";

-- DropForeignKey
ALTER TABLE "EventEnrollment" DROP CONSTRAINT "EventEnrollment_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventEnrollment" DROP CONSTRAINT "EventEnrollment_userId_fkey";

-- DropForeignKey
ALTER TABLE "LeaseWorkstation" DROP CONSTRAINT "LeaseWorkstation_leaseId_fkey";

-- DropForeignKey
ALTER TABLE "LeaseWorkstation" DROP CONSTRAINT "LeaseWorkstation_workstationId_fkey";

-- DropForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT "Milestone_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PointsRecord" DROP CONSTRAINT "PointsRecord_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectUndertaker" DROP CONSTRAINT "ProjectUndertaker_projectId_fkey";

-- DropForeignKey
ALTER TABLE "RedemptionOrder" DROP CONSTRAINT "RedemptionOrder_userId_fkey";

-- DropForeignKey
ALTER TABLE "SpaceReservation" DROP CONSTRAINT "SpaceReservation_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserIdentity" DROP CONSTRAINT "UserIdentity_userId_fkey";

-- DropForeignKey
ALTER TABLE "Workstation" DROP CONSTRAINT "Workstation_areaId_fkey";

-- AlterTable
ALTER TABLE "AdminNotification" DROP CONSTRAINT "AdminNotification_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Application" DROP CONSTRAINT "Application_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Application_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Article" DROP CONSTRAINT "Article_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "columnId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "authorId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Article_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ArticleColumn" DROP CONSTRAINT "ArticleColumn_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "ArticleColumn_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "CommunityEvent" DROP CONSTRAINT "CommunityEvent_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Demand" DROP CONSTRAINT "Demand_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "projectId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Demand_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "DemandRespondent" ALTER COLUMN "demandId" SET DATA TYPE VARCHAR(16);

-- AlterTable
ALTER TABLE "Enterprise" DROP CONSTRAINT "Enterprise_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EventEnrollment" ALTER COLUMN "eventId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "userId" SET DATA TYPE VARCHAR(16);

-- AlterTable
ALTER TABLE "ExperienceRecord" DROP CONSTRAINT "ExperienceRecord_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "ExperienceRecord_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ExternalEnterpriseProfile" DROP CONSTRAINT "ExternalEnterpriseProfile_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "ExternalEnterpriseProfile_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Lease" DROP CONSTRAINT "Lease_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "renterId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Lease_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "LeaseWorkstation" DROP CONSTRAINT "LeaseWorkstation_pkey",
ALTER COLUMN "leaseId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "workstationId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "LeaseWorkstation_pkey" PRIMARY KEY ("leaseId", "workstationId");

-- AlterTable
ALTER TABLE "MallGoods" DROP CONSTRAINT "MallGoods_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "MallGoods_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Milestone" ALTER COLUMN "projectId" SET DATA TYPE VARCHAR(16);

-- AlterTable
ALTER TABLE "PointsRecord" DROP CONSTRAINT "PointsRecord_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "userId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "PointsRecord_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Project" DROP CONSTRAINT "Project_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "sourceDemandId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProjectUndertaker" ALTER COLUMN "projectId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "refId" SET DATA TYPE VARCHAR(16);

-- AlterTable
ALTER TABLE "RedemptionOrder" DROP CONSTRAINT "RedemptionOrder_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "userId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "goodsId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "RedemptionOrder_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ShowcaseRequest" DROP CONSTRAINT "ShowcaseRequest_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "targetId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "ShowcaseRequest_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Space" DROP CONSTRAINT "Space_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Space_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SpaceReservation" DROP CONSTRAINT "SpaceReservation_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "userId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "spaceId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "SpaceReservation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "uid" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("uid");

-- AlterTable
ALTER TABLE "UserIdentity" ALTER COLUMN "userId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "enterpriseId" SET DATA TYPE VARCHAR(16);

-- AlterTable
ALTER TABLE "Workstation" DROP CONSTRAINT "Workstation_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "areaId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "enterpriseId" SET DATA TYPE VARCHAR(16),
ALTER COLUMN "leaseId" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "WorkstationArea" DROP CONSTRAINT "WorkstationArea_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(16),
ADD CONSTRAINT "WorkstationArea_pkey" PRIMARY KEY ("id");

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

