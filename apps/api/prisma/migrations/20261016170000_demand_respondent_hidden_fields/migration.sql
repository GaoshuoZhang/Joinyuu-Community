-- 需求响应字段级可见性（响应审核「向需求方显示」勾选）：hiddenFields 记录对需求方隐藏的响应字段
ALTER TABLE "DemandRespondent" ADD COLUMN IF NOT EXISTS "hiddenFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
