-- CreateTable
CREATE TABLE "PaymentMerchantConfig" (
    "id" VARCHAR(16) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" VARCHAR(64) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMerchantConfig_pkey" PRIMARY KEY ("id")
);

-- Preserve existing cash choices, retire the simultaneous points price.
UPDATE "MallGoods" SET "points" = 0 WHERE "chargeAmountFen" > 0;
UPDATE "Space" SET "feePerHour" = 0 WHERE "chargeAmountFen" > 0;
ALTER TABLE "MallGoods" ADD CONSTRAINT "MallGoods_exclusive_price_check" CHECK ("points" >= 0 AND (("points" > 0 AND "chargeAmountFen" = 0) OR ("points" = 0 AND "chargeAmountFen" > 0)));
ALTER TABLE "Space" ADD CONSTRAINT "Space_exclusive_price_check" CHECK ("feePerHour" >= 0 AND NOT ("feePerHour" > 0 AND "chargeAmountFen" > 0));
