import { Module } from '@nestjs/common'
import { AppEnterprisesController, CardsAdminController } from './enterprises.controller'
import { AppEnterprisesService } from './enterprises.service'

/* 企业治理模块（M2-R R3 /api/app/**）：名片/身份、企业详情与成员管理、邀请、负责人转移（请求制）、
 * 退驻与展示申请、公开企业名片与工作台。
 * 依赖均为全局模块（Prisma/IdGenerator/Notification）；本批次不注册 app.module。 */
@Module({
  controllers: [AppEnterprisesController, CardsAdminController],
  providers: [AppEnterprisesService],
})
export class AppEnterprisesModule {}
