-- 凭据来源可切换：inline=后台直接填写密钥（只写/脱敏/不入审计）| env=登记环境变量名
-- SystemConfig 默认 inline（实名核验面向后台直填）；MessageChannel 默认 env（兼容既有种子数据）

-- AlterTable
ALTER TABLE "MessageChannel" ADD COLUMN     "credentialMode" VARCHAR(8) NOT NULL DEFAULT 'env';

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "realnameVerifyCredentialMode" VARCHAR(8) NOT NULL DEFAULT 'inline';
