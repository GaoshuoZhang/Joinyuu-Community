-- 需求响应去重：同用户对同一需求至多保留一条有效响应
-- 应用方式：`prisma migrate deploy`（手写部分唯一索引无法由 Prisma 声明，禁止 migrate dev / db push 生成迁移）
-- 手写迁移勿用 migrate dev 生成；并发重复响应时由应用层捕获 P2002 转 409。
-- 前置核对：库中不存在同 demandId+userId 的多条 withdrawnAt 为空的行（已确认 0 条冲突）。
CREATE UNIQUE INDEX "DemandRespondent_active_response_per_user_key"
  ON "DemandRespondent"("demandId", "userId") WHERE "withdrawnAt" IS NULL;