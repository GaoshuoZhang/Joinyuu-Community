import { Module } from '@nestjs/common'
import { AppPoliciesController } from './policies.controller'
import { AppPoliciesService } from './policies.service'

/* 协议版本下发模块（M2-R R3 /api/app/policies/:kind，@Public 免登录）。
 * 依赖 PrismaService 为全局模块，无需额外 imports。 */
@Module({
  controllers: [AppPoliciesController],
  providers: [AppPoliciesService],
})
export class AppPoliciesModule {}
