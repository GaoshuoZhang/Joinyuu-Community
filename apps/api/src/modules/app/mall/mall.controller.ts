import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { PageQueryDto } from '../../../common/dto/page-query.dto'
import { AppMallService } from './mall.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { ReviewOrderDto } from './dto/review-order.dto'

/* 积分商城（统一券码兑换）：商品浏览/详情、下单、退款、评价。
 * 核销由后台工作人员执行，用户侧不提供核销/收货端点。
 * 商品浏览与详情为游客可访问（移动端商城页无登录门槛），其余端点需登录。 */
@Controller('api/app/mall')
export class AppMallController {
  constructor(private readonly mall: AppMallService) {}

  @Public()
  @Get('goods')
  listGoods(
    @Req() req: AppAuthenticatedRequest,
    @Query() query: PageQueryDto,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ) {
    /* 可见范围按需方身份过滤：已登录取用户身份，游客按无身份（仅不限范围商品可见） */
    return this.mall.listGoods(query.page, query.pageSize, category, keyword, this.uid(req))
  }

  @Public()
  @Get('goods/:id')
  goodsDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.goodsDetail(id, this.uid(req))
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
  @Post('orders/:id/review')
  review(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: ReviewOrderDto) {
    return this.mall.reviewOrder(this.uid(req), id, dto)
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }
}

/* 我的兑换订单（M2-R R2）：归并到 me 前缀 */
@Controller('api/app/me')
export class AppMeOrdersController {
  constructor(private readonly mall: AppMallService) {}

  @Get('orders')
  myOrders(
    @Req() req: AppAuthenticatedRequest,
    @Query() query: PageQueryDto,
    @Query('status') status?: string,
  ) {
    return this.mall.myOrders(this.uid(req), query.page, query.pageSize, status)
  }

  /** 我的订单详情（仅订单本人；非本人/不存在 404） */
  @Get('orders/:id')
  myOrder(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.mall.myOrder(this.uid(req), id)
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }
}
