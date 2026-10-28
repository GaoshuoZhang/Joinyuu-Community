import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { LicenseMaintenance } from '../../common/license/license.guard'
import type { AppAuthenticatedRequest } from '../../common/interfaces/app-authenticated-request'
import { AppCommerceService } from './app-commerce.service'
import { BillQueryDto, CreateOrderDto, CreateQuoteDto, PayOrderDto, RefundRequestDto, TransactionQueryDto } from './app-commerce.dto'

function requestContext(req: Request) {
  const raw = req.ip || req.socket?.remoteAddress || ''
  const ip = raw.replace(/^::ffff:/, '')
  return {
    userAgent: req.headers['user-agent'] ?? '',
    ip: /^[0-9a-fA-F:.]+$/.test(ip) ? ip : '',
  }
}

function uidOf(req: AppAuthenticatedRequest): string {
  const uid = req.user?.sub
  if (!uid) throw new UnauthorizedException('请先登录')
  return uid
}

@Controller('api/app/commerce')
export class AppCommerceController {
  constructor(private readonly service: AppCommerceService) {}

  @Get('capabilities')
  capabilities(@Req() req: AppAuthenticatedRequest & Request) {
    return this.service.capabilities(uidOf(req), req.headers['user-agent'] ?? '')
  }

  @Post('quotes')
  @HttpCode(200)
  createQuote(@Body() dto: CreateQuoteDto, @Req() req: AppAuthenticatedRequest) {
    return this.service.createQuote(uidOf(req), dto)
  }

  @Get('quotes/:id')
  quote(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.quoteDetail(uidOf(req), id)
  }

  @Post('orders')
  @HttpCode(200)
  createOrder(@Body() dto: CreateOrderDto, @Req() req: AppAuthenticatedRequest) {
    return this.service.createOrder(uidOf(req), dto)
  }

  @Get('orders/:id')
  order(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.orderDetail(uidOf(req), id)
  }

  @Post('orders/:id/payments')
  @HttpCode(200)
  pay(@Param('id') id: string, @Body() dto: PayOrderDto, @Req() req: AppAuthenticatedRequest & Request) {
    return this.service.startPayment(uidOf(req), id, dto, requestContext(req))
  }

  @Post('payments/:id/sync')
  @HttpCode(200)
  @LicenseMaintenance()
  sync(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.syncPayment(uidOf(req), id)
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @LicenseMaintenance()
  cancel(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.cancelOrder(uidOf(req), id)
  }

  @Post('orders/:id/refund-requests')
  @HttpCode(200)
  @LicenseMaintenance()
  requestRefund(@Param('id') id: string, @Body() dto: RefundRequestDto, @Req() req: AppAuthenticatedRequest) {
    return this.service.requestRefund(uidOf(req), id, dto)
  }

  @Get('refund-requests/:id')
  @LicenseMaintenance()
  refund(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.refundDetail(uidOf(req), id)
  }

  @Post('orders/:id/wechat-authorize')
  @HttpCode(200)
  authorize(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.authorizeUrl(uidOf(req), id)
  }

  @Post('bills/:id/orders')
  @HttpCode(200)
  billOrder(@Param('id') id: string, @Req() req: AppAuthenticatedRequest) {
    return this.service.createBillOrder(uidOf(req), id)
  }
}

@Controller('api/app/me')
export class AppCommerceMeController {
  constructor(private readonly service: AppCommerceService) {}

  @Get('transactions')
  transactions(@Query() query: TransactionQueryDto, @Req() req: AppAuthenticatedRequest) {
    return this.service.transactions(uidOf(req), query)
  }

  @Get('transactions/summary')
  summary(@Req() req: AppAuthenticatedRequest) {
    return this.service.transactionsSummary(uidOf(req))
  }

  @Get('bills')
  bills(@Query() query: BillQueryDto, @Req() req: AppAuthenticatedRequest) {
    return this.service.bills(uidOf(req), query)
  }
}

@Controller('api/app/commerce/wechat/oauth')
export class WechatOauthController {
  constructor(private readonly service: AppCommerceService) {}

  @Get('start')
  @Public()
  async start(@Query('ticket') ticket: string, @Res() res: Response) {
    try {
      const url = await this.service.oauthStart(ticket ?? '')
      res.redirect(302, url)
    } catch {
      res.status(400).json({ code: 400, message: '微信授权链接已失效，请返回收银台重新发起支付' })
    }
  }

  @Get('callback')
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const url = await this.service.oauthCallback(code ?? '', state ?? '')
      if (!url) {
        res.status(400).json({ code: 400, message: '微信授权失败，请返回收银台重试' })
        return
      }
      res.redirect(302, url)
    } catch {
      res.status(400).json({ code: 400, message: '微信授权已失效，请返回收银台重新发起支付' })
    }
  }
}
