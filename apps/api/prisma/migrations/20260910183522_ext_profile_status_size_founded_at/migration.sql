-- AlterTable
ALTER TABLE "ExternalEnterpriseProfile" ADD COLUMN     "foundedAt" VARCHAR(16) NOT NULL DEFAULT '',
ADD COLUMN     "size" VARCHAR(32) NOT NULL DEFAULT '',
ADD COLUMN     "status" VARCHAR(16) NOT NULL DEFAULT 'active';
