-- 积分商城统一券码兑换改造：
--   1. 所有商品统一券码现场兑换（移除 fulfillment / 发货方式 / 自提地址 / 运费）；
--   2. 订单状态收敛为 pending_use | finished | cancelled，下单即发券；
--   3. 移除收货地址簿（不再支持邮寄）。
-- 时间列均为 String 'YYYY-MM-DD HH:mm'，字典序即时间序。

-- ---------- RedemptionOrder：存量数据归并 ----------
-- 历史实物订单（待发货 / 已发货）统一转为「待使用」券码订单，补齐券码与有效期。
-- 券码：V + 8 位十六进制大写（去重依赖随机性，seed 会重跑，仅用于历史行占位）。
-- 有效期：无券码的历史行按下单日 + 30 天兜底。
UPDATE "RedemptionOrder"
   SET "status" = 'pending_use'
 WHERE "status" IN ('pending_shipment', 'shipped');

UPDATE "RedemptionOrder"
   SET "voucherCode" = 'V' || upper(substr(md5(random()::text || "id"), 1, 8))
 WHERE "voucherCode" IS NULL;

UPDATE "RedemptionOrder"
   SET "voucherExpiresAt" = to_char(
         (replace("createdAt", ' ', 'T')::timestamp) + interval '30 days',
         'YYYY-MM-DD HH24:MI')
 WHERE "voucherExpiresAt" IS NULL;

-- 券码 / 有效期转为非空列
ALTER TABLE "RedemptionOrder" ALTER COLUMN "voucherCode" SET NOT NULL;
ALTER TABLE "RedemptionOrder" ALTER COLUMN "voucherExpiresAt" SET NOT NULL;

-- 移除邮寄 / 自提 / 发货相关列
ALTER TABLE "RedemptionOrder"
  DROP COLUMN IF EXISTS "fulfillment",
  DROP COLUMN IF EXISTS "shippingMethod",
  DROP COLUMN IF EXISTS "pickupAddress",
  DROP COLUMN IF EXISTS "shippedAt",
  DROP COLUMN IF EXISTS "recipientName",
  DROP COLUMN IF EXISTS "recipientPhone",
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "addressId",
  DROP COLUMN IF EXISTS "trackingNo";

-- 券码检索索引（后台按券码锁定订单）
CREATE INDEX IF NOT EXISTS "RedemptionOrder_voucherCode_idx" ON "RedemptionOrder"("voucherCode");

-- ---------- MallGoods：移除履约相关列 ----------
ALTER TABLE "MallGoods"
  DROP COLUMN IF EXISTS "fulfillment",
  DROP COLUMN IF EXISTS "shippingMethods",
  DROP COLUMN IF EXISTS "pickupAddress",
  DROP COLUMN IF EXISTS "shippingFee";

-- ---------- 收货地址簿：整表移除 ----------
DROP TABLE IF EXISTS "Address";
