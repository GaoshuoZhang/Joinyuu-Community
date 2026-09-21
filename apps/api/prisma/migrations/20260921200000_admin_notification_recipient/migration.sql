-- BE-M4：通知中心按收件人归属过滤
-- AdminNotification 增加 recipientId（管理员账号 id）：NULL = 全局广播（定时任务/系统事件），非空 = 定向通知。
-- 既有数据全为广播，无需回填。
-- 应用方式：`prisma migrate deploy`
ALTER TABLE "AdminNotification" ADD COLUMN "recipientId" VARCHAR(16);

CREATE INDEX "AdminNotification_recipientId_idx" ON "AdminNotification"("recipientId");