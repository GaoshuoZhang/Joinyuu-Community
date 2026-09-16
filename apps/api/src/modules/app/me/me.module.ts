import { Module } from '@nestjs/common'
import { MeController } from './me.controller'
import { MeService } from './me.service'

/* 移动端个人中心模块（/api/app/me）：资料聚合、积分/经验流水、改密/换绑、注销与导出。
 * 依赖均为全局模块（Prisma/Redis/IdGenerator/Notification），无需额外 imports。 */
@Module({
  controllers: [MeController],
  providers: [MeService],
})
export class AppMeModule {}