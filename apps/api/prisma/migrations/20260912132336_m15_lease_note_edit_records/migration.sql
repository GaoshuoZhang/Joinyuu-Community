-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "editRecords" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "note" VARCHAR(255);
