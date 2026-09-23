-- 实物商品支持「自提 / 邮寄」二选一：订单表新增发货方式与自提地址快照。
-- shippingMethod：pickup | delivery（历史邮寄订单为空，客户端按邮寄语义兜底展示）。
-- pickupAddress：下单时从商品 MallGoods.pickupAddress 复制，保证商品后续改址不影响已生成订单。
ALTER TABLE "RedemptionOrder" ADD COLUMN IF NOT EXISTS "shippingMethod" VARCHAR(16);
ALTER TABLE "RedemptionOrder" ADD COLUMN IF NOT EXISTS "pickupAddress" VARCHAR(255);
