import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { MallService, type RedemptionOrderDto } from './mall.service'
import { QueryGoodsDto } from './dto/query-goods.dto'
import { GoodsPayloadDto } from './dto/goods-payload.dto'
import { QueryRedemptionOrdersDto } from './dto/query-redemption-orders.dto'
import { UpdatePointsRuleDto } from './dto/update-points-rule.dto'

@Controller('api/admin/mall')
export class MallController {
  constructor(private readonly mall: MallService) {}

  /* ---------- 商品管理 ---------- */

  @Get('goods')
  listGoods(@Query() query: QueryGoodsDto) {
    return this.mall.listGoods(query)
  }

  @HttpCode(200)
  @Post('goods')
  createGoods(@Body() dto: GoodsPayloadDto) {
    return this.mall.createGoods(dto)
  }

  @HttpCode(200)
  @Put('goods/:id')
  updateGoods(@Param('id') id: string, @Body() dto: GoodsPayloadDto) {
    return this.mall.updateGoods(id, dto)
  }

  @HttpCode(200)
  @Post('goods/:id/toggle-status')
  toggleGoodsStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.toggleGoodsStatus(id, req.user?.name ?? '社区管理员')
  }

  /* ---------- 兑换订单 ---------- */

  @Get('redemption-orders')
  listRedemptionOrders(
    @Query() query: QueryRedemptionOrdersDto,
  ): Promise<{ list: RedemptionOrderDto[]; total: number }> {
    return this.mall.listRedemptionOrders(query)
  }

  @HttpCode(200)
  @Post('redemption-orders/:id/ship')
  shipOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.shipOrder(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post('redemption-orders/:id/finish')
  finishOrder(@Param('id') id: string) {
    return this.mall.finishOrder(id)
  }

  @HttpCode(200)
  @Post('redemption-orders/:id/cancel')
  cancelOrder(@Param('id') id: string) {
    return this.mall.cancelOrder(id)
  }

  /* ---------- 积分规则 ---------- */

  @Get('points-rules')
  listPointsRules() {
    return this.mall.listPointsRules()
  }

  @HttpCode(200)
  @Put('points-rules/:code')
  updatePointsRule(@Param('code') code: string, @Body() dto: UpdatePointsRuleDto) {
    return this.mall.updatePointsRule(code, dto)
  }

  @HttpCode(200)
  @Post('points-rules/:code/toggle-status')
  togglePointsRuleStatus(@Param('code') code: string) {
    return this.mall.togglePointsRuleStatus(code)
  }

  /* ---------- 积分发放记录 ---------- */

  @Get('points-issuance')
  listPointsIssuance() {
    return this.mall.listPointsIssuance()
  }
}
