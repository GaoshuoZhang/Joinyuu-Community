import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { MallService, type RedemptionOrderDto } from './mall.service'
import { QueryGoodsDto } from './dto/query-goods.dto'
import { GoodsPayloadDto } from './dto/goods-payload.dto'
import { QueryRedemptionOrdersDto } from './dto/query-redemption-orders.dto'
import { UpdatePointsRuleDto } from './dto/update-points-rule.dto'

@Controller('api/admin/mall')
export class MallController {
  constructor(private readonly mall: MallService) {}

  /* ---------- 商品管理 ---------- */

  @RequirePermission('/mall/goods')
  @Get('goods')
  listGoods(@Query() query: QueryGoodsDto) {
    return this.mall.listGoods(query)
  }

  @RequirePermission('/mall/goods')
  @HttpCode(200)
  @Post('goods')
  createGoods(@Body() dto: GoodsPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.mall.createGoods(dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/mall/goods')
  @HttpCode(200)
  @Put('goods/:id')
  updateGoods(@Param('id') id: string, @Body() dto: GoodsPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.mall.updateGoods(id, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/mall/goods')
  @HttpCode(200)
  @Post('goods/:id/toggle-status')
  toggleGoodsStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.toggleGoodsStatus(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/mall/goods')
  @HttpCode(200)
  @Post('goods/:id/archive')
  archiveGoods(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.archiveGoods(id, req.user?.name ?? '社区管理员')
  }

  /* ---------- 兑换订单 ---------- */

  @RequirePermission('/mall/orders')
  @Get('redemption-orders')
  listRedemptionOrders(
    @Query() query: QueryRedemptionOrdersDto,
  ): Promise<{ list: RedemptionOrderDto[]; total: number }> {
    return this.mall.listRedemptionOrders(query)
  }

  @RequirePermission('/mall/orders')
  @HttpCode(200)
  @Post('redemption-orders/:id/verify')
  verifyOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.verifyOrder(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/mall/orders')
  @HttpCode(200)
  @Post('redemption-orders/:id/archive')
  archiveOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.archiveOrder(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/mall/orders')
  @HttpCode(200)
  @Post('redemption-orders/:id/cancel')
  cancelOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mall.cancelOrder(id, req.user?.name ?? '社区管理员')
  }

  /* ---------- 积分规则 ---------- */

  @RequirePermission('/rules/points')
  @Get('points-rules')
  listPointsRules() {
    return this.mall.listPointsRules()
  }

  @RequirePermission('/rules/points')
  @HttpCode(200)
  @Put('points-rules/:code')
  updatePointsRule(@Param('code') code: string, @Body() dto: UpdatePointsRuleDto) {
    return this.mall.updatePointsRule(code, dto)
  }

  @RequirePermission('/rules/points')
  @HttpCode(200)
  @Post('points-rules/:code/toggle-status')
  togglePointsRuleStatus(@Param('code') code: string) {
    return this.mall.togglePointsRuleStatus(code)
  }

  /* ---------- 积分发放记录 ---------- */

  @RequirePermission('/rules/ledger')
  @Get('points-issuance')
  listPointsIssuance() {
    return this.mall.listPointsIssuance()
  }
}
