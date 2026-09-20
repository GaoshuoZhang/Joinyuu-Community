import { Module } from '@nestjs/common'
import { RealnameVerificationService } from './realname-verification.service'

/* 实名核验（P1）：权威二要素驱动注册 + 联通性测试 + 核验调用。
 * 供系统配置（后台配置/测试）与 app 实名模块（提交核验）复用。 */
@Module({
  providers: [RealnameVerificationService],
  exports: [RealnameVerificationService],
})
export class RealnameModule {}
