-- 项目补充需求方 / 创建人 / 联系方式 / 合同价格：需求立项时照搬需求快照，社区自建项目由表单录入。
ALTER TABLE "Project"
  ADD COLUMN "demanderId" VARCHAR(16),
  ADD COLUMN "demanderName" VARCHAR(128),
  ADD COLUMN "demanderIdentity" JSONB,
  ADD COLUMN "creatorName" VARCHAR(64),
  ADD COLUMN "creatorId" VARCHAR(16),
  ADD COLUMN "contactName" VARCHAR(64),
  ADD COLUMN "contactPhone" VARCHAR(32),
  ADD COLUMN "contactEmail" VARCHAR(128),
  ADD COLUMN "contractPrice" VARCHAR(64);

-- 历史需求立项项目回填：从来源需求复制发布方与联系方式，避免既有项目缺失需求方信息。
UPDATE "Project" p SET
  "demanderId" = d."publisherId",
  "demanderName" = d."publisherName",
  "demanderIdentity" = d."publisherIdentity",
  "creatorName" = COALESCE(d."creatorName", d."publisherName"),
  "creatorId" = COALESCE(d."creatorId", d."publisherId"),
  "contactName" = d."contactName",
  "contactPhone" = d."contactPhone",
  "contactEmail" = d."contactEmail",
  "contractPrice" = d.budget
FROM "Demand" d
WHERE p."sourceDemandId" = d.id AND p."demanderId" IS NULL;
