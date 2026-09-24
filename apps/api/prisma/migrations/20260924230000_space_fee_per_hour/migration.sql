-- 公共空间预约费用（积分）：
--   1. Space.feePerHour：预约费用（积分/小时），0 = 免费使用（客户端列表/预约页展示）；
--   2. SpaceReservation.feePoints：该预约实际消耗的积分，驳回/取消时按此金额全额退回；
--   3. PointsRecord.source 新增 space（空间预约扣分/退分流水）。
-- 计费小时：不足 1 小时按 1 小时计（全天开放结束时间为 23:59 → N 小时 59 分按 N+1 小时计）。

ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "feePerHour" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SpaceReservation" ADD COLUMN IF NOT EXISTS "feePoints" INTEGER NOT NULL DEFAULT 0;