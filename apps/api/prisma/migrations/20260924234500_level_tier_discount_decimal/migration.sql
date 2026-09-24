-- 积分消费折扣支持一位小数（如 8.5 = 85 折）：
--   LevelTier.pointsDiscount 由 INTEGER 改为 DOUBLE PRECISION（默认 10 = 原价）；
--   折后价 = round(原价 × 折扣 ÷ 10)，不足 1 分四舍五入（后端以「折扣×10 的整数」计算，避免浮点误差）。
-- 存量整数折扣（1-10）语义不变。

ALTER TABLE "LevelTier" ALTER COLUMN "pointsDiscount" TYPE DOUBLE PRECISION USING "pointsDiscount"::double precision;
ALTER TABLE "LevelTier" ALTER COLUMN "pointsDiscount" SET DEFAULT 10;