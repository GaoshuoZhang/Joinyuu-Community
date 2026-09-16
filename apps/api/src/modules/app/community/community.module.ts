import { Module } from '@nestjs/common'
import { AppCommunityController } from './community.controller'
import { AppCommunityService } from './community.service'

/* 社区域模块（M2-R R3 /api/app/community）：社区政策 / 人才库 / 公开人才名片 / 企业库。
 * 依赖 PrismaService 为全局模块，无需额外 imports。 */
@Module({
  controllers: [AppCommunityController],
  providers: [AppCommunityService],
})
export class AppCommunityModule {}
