-- MallGoods：归档时间 + 发货方式/运费/自定义范围字段；默认状态改为已下架（新增商品默认下架）
ALTER TABLE "MallGoods"
    ADD COLUMN "archivableAt" VARCHAR(16),
    ADD COLUMN "shippingMethods" TEXT[],
    ADD COLUMN "pickupAddress" VARCHAR(255),
    ADD COLUMN "shippingFee" INTEGER,
    ADD COLUMN "visibilityIdentities" TEXT[],
    ADD COLUMN "visibilityLevels" TEXT[],
    ADD COLUMN "orderIdentities" TEXT[],
    ADD COLUMN "orderLevels" TEXT[];
ALTER TABLE "MallGoods" ALTER COLUMN "status" SET DEFAULT 'off';

-- RedemptionOrder：归档字段（已完成订单可归档）
ALTER TABLE "RedemptionOrder"
    ADD COLUMN "deletedAt" VARCHAR(16),
    ADD COLUMN "deletedBy" VARCHAR(64),
    ADD COLUMN "archivableAt" VARCHAR(16);

-- ArchiveSetting：按状态的自动归档开关（JSON：{ status: boolean }）
ALTER TABLE "ArchiveSetting" ADD COLUMN "archiveStatuses" JSONB;
