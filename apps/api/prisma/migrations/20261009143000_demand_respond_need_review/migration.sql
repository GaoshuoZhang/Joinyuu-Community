-- 需求响应审核：
--   1. Demand.respondNeedReview：响应需审核开关（默认 true）；开启时客户端提交的响应先落 pending_review，
--      管理员审核通过（→ pending，仍由发布者选定承接方）后发布者才可见；驳回（→ rejected）视为响应失效，允许重新响应。
--   2. DemandRespondent.status 新增取值 pending_review（无 DDL，status 为字符串枚举；审核复用既有 reviewAt/rejectReason/withdrawnAt）。

ALTER TABLE "Demand" ADD COLUMN IF NOT EXISTS "respondNeedReview" BOOLEAN NOT NULL DEFAULT true;