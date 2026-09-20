-- P1 实名核验（权威二要素）：SystemConfig 扩展启用开关 / 供应商单选 / 非机密参数 / 凭据环境变量名 / 联通性测试结果
-- 说明：凭据只登记环境变量名（realnameVerifyCredentialEnv），不落库明文；配置变更后 realnameVerifyTestOk 重置为 false，需重新测试联通。

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "realnameVerifyConfig" JSONB,
ADD COLUMN     "realnameVerifyCredentialEnv" JSONB,
ADD COLUMN     "realnameVerifyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "realnameVerifyProvider" VARCHAR(16) NOT NULL DEFAULT '',
ADD COLUMN     "realnameVerifyTestOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "realnameVerifyTestedAt" VARCHAR(16);
