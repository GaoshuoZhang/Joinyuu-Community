-- 用户名 90 天限改一次：记录最近一次修改时间（null=从未修改，可随时修改）。
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" VARCHAR(16);
