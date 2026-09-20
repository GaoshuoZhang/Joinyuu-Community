-- 商城：移除「订阅补货」能力（表与联动通知下线；缺货商品保持可见并直接提示售罄）。
DROP TABLE IF EXISTS "RestockSubscribe";

-- 权益券有效期（天）：下单时据此计算券码到期时间（空值按 30 天）。
ALTER TABLE "MallGoods" ADD COLUMN "validDays" INTEGER;
-- 既有券类商品回填：单杯咖啡券描述为 7 天，其余券默认 30 天。
UPDATE "MallGoods" SET "validDays" = 7 WHERE "id" = 'G1007';
UPDATE "MallGoods" SET "validDays" = 30 WHERE "fulfillment" = 'voucher' AND "validDays" IS NULL;
