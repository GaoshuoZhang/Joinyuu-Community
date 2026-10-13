-- 租约续期记录：与 editRecords 同形的 JSON 追加数组（续期动作独立于「编辑」，用于租赁详情「续期记录」选项卡）
--   元素：{ at, operator, reason, fromEndDate, toEndDate, fromRent, toRent }
ALTER TABLE "Lease" ADD COLUMN IF NOT EXISTS "renewRecords" JSONB NOT NULL DEFAULT '[]';