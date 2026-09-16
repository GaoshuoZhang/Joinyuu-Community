import { Module } from '@nestjs/common'
import { AppMallController, AppMeOrdersController } from './mall.controller'
import { AppMallService } from './mall.service'

/* 积分商城（M2-R R2，/api/app/mall + /api/app/me/orders）：
 * 商品浏览/详情、兑换下单（单事务）、订单取消/核销/收货/评价、到货提醒订阅。
 * 依赖均为全局模块（Prisma/IdGenerator/Redis/Notification），无需额外 imports。 */
@Module({
  controllers: [AppMallController, AppMeOrdersController],
  providers: [AppMallService],
})
export class AppMallModule {}