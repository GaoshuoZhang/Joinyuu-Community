-- 商品类别（字典 type=goods_category）级别数据：可见范围 / 可下单范围四字段
--   1. 后台「商品管理」页「商品类别」入口维护（原「数据字典 > 商品类型」迁移至此）；
--   2. 门槛语义：商品同时通过「类别范围」与「商品自身范围」才可见/可下单（空数组 = 不限）；
--   3. 其余字典类型（需求类别 / 行业 / 活动类型）不涉及，恒为空数组。

ALTER TABLE "DictEntry" ADD COLUMN IF NOT EXISTS "visibilityIdentities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DictEntry" ADD COLUMN IF NOT EXISTS "visibilityLevels"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DictEntry" ADD COLUMN IF NOT EXISTS "orderIdentities"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DictEntry" ADD COLUMN IF NOT EXISTS "orderLevels"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];