-- 项目结项时间（D-108/D-109）：结项与自动结项写入；详情/列表用于结项状态展示。
ALTER TABLE "Project" ADD COLUMN "finishedAt" VARCHAR(16);
-- 历史已结项项目按结束日期回填（无结束日期则留空）。
UPDATE "Project" SET "finishedAt" = NULLIF("endDate", '') WHERE "status" = 'finished' AND "finishedAt" IS NULL;
