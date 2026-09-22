-- 数据字典排序值规范化（纯数据迁移，不改表结构）
-- 背景：新增字典项原按「条目数 + 1」写 sort，与既有 sort 重叠后留下重复值（如商品类型 1/3/3/4）。
-- 处理：按 type 分区、sort + code 升序重编号为 1..n，保持既有展示顺序不变（并列时以 code 定序）。
-- 编码（GC002 缺口）不动：新增字典项时由服务端取「最小未占用序号」自动补上。
-- 应用方式：`pnpm --filter @joinyuu/api db:migrate`（prisma migrate deploy）
UPDATE "DictEntry" AS d
SET "sort" = ranked.rn
FROM (
  SELECT
    "type",
    "code",
    ROW_NUMBER() OVER (PARTITION BY "type" ORDER BY "sort" ASC, "code" ASC) AS rn
  FROM "DictEntry"
) AS ranked
WHERE d."type" = ranked."type"
  AND d."code" = ranked."code"
  AND d."sort" <> ranked.rn;
