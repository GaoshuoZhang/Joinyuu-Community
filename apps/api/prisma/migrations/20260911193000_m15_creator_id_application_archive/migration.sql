-- AlterTable
ALTER TABLE "Application" ADD COLUMN "deletedAt" VARCHAR(16),
ADD COLUMN "deletedBy" VARCHAR(64),
ADD COLUMN "archivableAt" VARCHAR(16);

-- AlterTable
ALTER TABLE "Demand" ADD COLUMN "creatorId" VARCHAR(16);
