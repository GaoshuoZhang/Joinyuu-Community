-- 企业信息移除「发展阶段」属性；系统配置移除与积分规则重复的「每日登录积分奖励」开关
ALTER TABLE "Enterprise" DROP COLUMN "stage";
ALTER TABLE "SystemConfig" DROP COLUMN "dailyLoginPoints";
