-- 需求响应补充信息（客户端「响应需求」表单新增字段）：
--   1. DemandRespondent.timeline：可投入时间/预计工期（自由文本，如「2 周内可开工」）；
--   2. DemandRespondent.cases：相关经验与案例（≤300 字）。
-- 均为选填，存量响应为 NULL。

ALTER TABLE "DemandRespondent" ADD COLUMN IF NOT EXISTS "timeline" VARCHAR(128);
ALTER TABLE "DemandRespondent" ADD COLUMN IF NOT EXISTS "cases" VARCHAR(300);