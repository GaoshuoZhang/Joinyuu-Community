-- A policy version identifies one immutable agreement/community-policy revision per kind.
CREATE UNIQUE INDEX "Policy_kind_version_key" ON "Policy"("kind", "version");
