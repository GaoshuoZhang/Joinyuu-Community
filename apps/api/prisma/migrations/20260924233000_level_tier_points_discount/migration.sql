-- 等级积分消费折扣：LevelTier.pointsDiscount（1 = 1 折 … 10 = 原价）
--   1. 等级规则页「积分消费折扣」列（社区个体 / 社区企业两个梯度各自维护）；
--   2. 消费积分时按等级折扣扣分：商城兑换取用户社区个体等级折扣、代企业预约空间取企业社区企业等级折扣；
--      折后价 = round(原价 × 折扣 ÷ 10)，不足 1 分四舍五入；无对应等级 = 原价（10）。
-- 存量等级行补 10（原价），行为与改动前一致。

ALTER TABLE "LevelTier" ADD COLUMN IF NOT EXISTS "pointsDiscount" INTEGER NOT NULL DEFAULT 10;