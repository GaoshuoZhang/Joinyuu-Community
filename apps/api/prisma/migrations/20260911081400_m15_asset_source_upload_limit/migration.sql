-- AlterTable
ALTER TABLE "MallAsset" ADD COLUMN     "sourceId" VARCHAR(16),
ADD COLUMN     "sourceType" VARCHAR(16);

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "uploadMaxSizeMb" INTEGER NOT NULL DEFAULT 10;

-- CreateIndex
CREATE INDEX "MallAsset_sourceType_idx" ON "MallAsset"("sourceType");
