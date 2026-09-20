-- 用户通知偏好：按通知类型静音（system 账号与安全类不可静音，由服务端校验）。
CREATE TABLE "UserNotificationPreference" (
    "userId" VARCHAR(16) NOT NULL,
    "mutedTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
