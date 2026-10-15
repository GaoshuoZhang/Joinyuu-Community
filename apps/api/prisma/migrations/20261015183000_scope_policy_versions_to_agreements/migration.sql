-- 社区政策是独立文档，允许不同政策使用相同版本号。
-- 只有用户协议/隐私协议按类型发布版本，继续限制已发布的同类型同版本重复。
-- 先建立收窄后的索引，再删除旧索引；事务保证失败时原有约束完整保留。
BEGIN;
CREATE UNIQUE INDEX "Policy_published_agreement_kind_version_key"
  ON "Policy"("kind", "version")
  WHERE "status" = 'published' AND "kind" IN ('agreement_user', 'agreement_privacy');
DROP INDEX "Policy_published_kind_version_key";
COMMIT;
