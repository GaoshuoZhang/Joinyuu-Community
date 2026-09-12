-- 社区成员登录密码（管理员可强制重置覆盖）
ALTER TABLE "User" ADD COLUMN     "passwordHash" VARCHAR(255);
ALTER TABLE "User" ADD COLUMN     "passwordUpdatedAt" VARCHAR(16);
