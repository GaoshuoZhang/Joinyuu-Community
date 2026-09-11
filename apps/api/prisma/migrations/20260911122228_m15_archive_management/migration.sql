-- AlterTable
ALTER TABLE "CommunityEvent" ADD COLUMN     "archivableAt" VARCHAR(16);

-- AlterTable
ALTER TABLE "Demand" ADD COLUMN     "archivableAt" VARCHAR(16),
ADD COLUMN     "creatorName" VARCHAR(64);

-- AlterTable
ALTER TABLE "Enterprise" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "ExternalEnterpriseProfile" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "archivableAt" VARCHAR(16),
ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivableAt" VARCHAR(16);

-- AlterTable
ALTER TABLE "SpaceReservation" ADD COLUMN     "archivableAt" VARCHAR(16),
ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- CreateTable
CREATE TABLE "ArchiveSetting" (
    "domain" VARCHAR(24) NOT NULL,
    "autoArchive" BOOLEAN NOT NULL DEFAULT false,
    "archiveDelayDays" INTEGER NOT NULL DEFAULT 7,
    "autoPurge" BOOLEAN NOT NULL DEFAULT false,
    "purgeDelayDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "ArchiveSetting_pkey" PRIMARY KEY ("domain")
);
