-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "deletedAt" VARCHAR(16),
ADD COLUMN     "deletedBy" VARCHAR(64);

-- CreateIndex
CREATE INDEX "Announcement_deletedAt_idx" ON "Announcement"("deletedAt");
