import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppMallService } from './mall.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { ReviewOrderDto } from './dto/review-order.dto'

/* 积分商城（M2-R R2）：商品浏览/详情、下单、取消/核销/收货/评价、到货提醒订阅 */
@Controller('api/app/mall')
export class AppMallController {
  constructor(private readonly mall: AppMallService) {}

  @Get('goods')
  listGoods(
    @Req() req: AppAuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.mall.listGoods(this.page(page), this.page(pageSize, 10), category, keyword)
  }

  @Get('goods/:id')
  goodsDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.goodsDetail(id)
  }

  @HttpCode(200)
  @Post('orders')
  createOrder(@Req() req: AppAuthenticatedRequest, @Body() dto: CreateOrderDto) {
    return this.mall.createOrder(this.uid(req), dto)
  }

  @HttpCode(200)
  @Post('orders/:id/cancel')
  cancel(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.cancelOrder(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('orders/:id/use')
  use(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.useOrder(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('orders/:id/confirm')
  confirm(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.confirmOrder(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('orders/:id/review')
  review(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: ReviewOrderDto) {
    return this.mall.reviewOrder(this.uid(req), id, dto)
  }

  @HttpCode(200)
  @Post('goods/:id/restock-subscribe')
  subscribe(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.subscribeRestock(this.uid(req), id)
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }

  private page(raw?: string, fallback = 1): number {
    const n = Number.parseInt(raw ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
}

/* 我的兑换订单（M2-R R2）：归并到 me 前缀 */
@Controller('api/app/me')
export class AppMeOrdersController {
  constructor(private readonly mall: AppMallService) {}

  @Get('orders')
  myOrders(@Req() req: AppAuthenticatedRequest) {
    return this.mall.myOrders(this.uid(req))
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }
}