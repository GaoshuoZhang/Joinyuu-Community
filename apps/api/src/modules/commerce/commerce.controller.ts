import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request, Response } from 'express'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { LicenseMaintenance } from '../../common/license/license.guard'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { CommerceService } from './commerce.service'
import { CommercePaymentService } from './commerce-payment.service'
import { WechatPayClient, WechatTransaction } from './wechat-pay.client'
import { COMMERCE_MODULES, CommerceQueryDto, CreateCommerceBillDto, RefundCommerceDto, RegisterReceiptDto, ReviewReceiptDto } from './commerce.dto'

class SourceQuery {
  @IsIn(COMMERCE_MODULES) module!: string
  @IsOptional() @IsString() @MaxLength(128) keyword = ''
}
class BuyerQuery {
  @IsIn(['user', 'enterprise']) type!: string
  @IsOptional() @IsString() @MaxLength(128) keyword = ''
}

@Controller('api/admin/commerce')
export class CommerceController {
  constructor(private readonly service: CommerceService, private readonly payments: CommercePaymentService, private readonly wx: WechatPayClient) {}
  @Get('overview') @RequirePermission('/commerce/overview') overview() { return this.service.overview() }
  @Get('capabilities') @RequirePermission('/commerce/receivables') capabilities() { return this.wx.config() }
  @Get('sources') @RequirePermission('perm:commerce:bill:create') sources(@Query() q: SourceQuery) { return this.service.options(q.module, q.keyword) }
  @Get('sources/:id') @RequirePermission('perm:commerce:bill:create') source(@Param('id') id: string, @Query() q: SourceQuery) { return this.service.source(q.module, id) }
  @Get('buyers') @RequirePermission('perm:commerce:bill:create') buyers(@Query() q: BuyerQuery) { return this.service.buyers(q.type, q.keyword) }
  @Get('bills') @RequirePermission('/commerce/receivables') bills(@Query() q: CommerceQueryDto) { return this.service.bills(q) }
  @Get('bills/:id') @RequirePermission('/commerce/receivables') detail(@Param('id') id: string) { return this.service.detail(id) }
  @Post('bills') @RequirePermission('perm:commerce:bill:create') createBill(@Body() dto: CreateCommerceBillDto, @Req() req: AuthenticatedRequest) { return this.service.createBill(dto, req.user!.sub) }
  @Post('bills/:id/void') @HttpCode(200) @RequirePermission('perm:commerce:bill:create') voidBill(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.service.voidBill(id, req.user!.sub) }
  @Post('bills/:id/receipts') @RequirePermission('perm:commerce:receipt:create') receipt(@Param('id') id: string, @Body() dto: RegisterReceiptDto, @Req() req: AuthenticatedRequest) { return this.service.receipt(id, dto, req.user!.sub) }
  @Post('receipts/:id/review') @HttpCode(200) @RequirePermission('perm:commerce:receipt:review') reviewReceipt(@Param('id') id: string, @Body() dto: ReviewReceiptDto, @Req() req: AuthenticatedRequest) { return this.service.reviewReceipt(id, dto.status, req.user!.sub) }
  @Post('bills/:id/native-payment') @HttpCode(200) @RequirePermission('perm:commerce:payment:create') nativePayment(@Param('id') id: string) { return this.payments.nativePayment(id) }
  @Post('payments/:id/sync') @HttpCode(200) @LicenseMaintenance() @RequirePermission('/commerce/receivables') sync(@Param('id') id: string) { return this.payments.syncPayment(id) }
  @Post('payments/:id/refunds') @LicenseMaintenance() @RequirePermission('perm:commerce:refund:create') refund(@Param('id') id: string, @Body() dto: RefundCommerceDto, @Req() req: AuthenticatedRequest) { return this.payments.requestRefund(id, dto, req.user!.sub) }
  @Post('refunds/:id/approve') @HttpCode(200) @LicenseMaintenance() @RequirePermission('perm:commerce:refund:approve') approveRefund(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.payments.approveRefund(id, req.user!.sub) }
  @Post('refunds/:id/reject') @HttpCode(200) @LicenseMaintenance() @RequirePermission('perm:commerce:refund:approve') rejectRefund(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.payments.rejectRefund(id, req.user!.sub) }
  @Post('refunds/:id/sync') @HttpCode(200) @LicenseMaintenance() @RequirePermission('/commerce/receivables') syncRefund(@Param('id') id: string) { return this.payments.syncRefund(id) }
}

@Controller('api/payment-notifications/wechat')
export class WechatNotificationController {
  constructor(private readonly wx: WechatPayClient, private readonly payments: CommercePaymentService) {}
  @Post('payment') @Public() @LicenseMaintenance()
  async payment(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      if (!req.rawBody) { res.status(400).json({ code: 'FAIL', message: '缺少原始报文' }); return }
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value)
      const notice = await this.wx.decryptNotification(req.rawBody.toString('utf8'), headers)
      if (notice.event !== 'TRANSACTION.SUCCESS') { res.status(400).json({ code: 'FAIL', message: '通知类型不支持' }); return }
      await this.payments.confirmPayment(notice.payload as unknown as WechatTransaction)
      res.status(204).end()
    } catch { res.status(400).json({ code: 'FAIL', message: '通知验证或处理失败' }) }
  }
}
