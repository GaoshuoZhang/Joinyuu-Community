import { PaymentConfigService } from './payment-config.service'
import { PaymentConfigController } from './payment-config.controller'
import { Module } from '@nestjs/common'
import { CommerceController, WechatNotificationController } from './commerce.controller'
import { CommerceService } from './commerce.service'
import { CommercePaymentService } from './commerce-payment.service'
import { WechatPayClient } from './wechat-pay.client'

@Module({ controllers: [PaymentConfigController, CommerceController, WechatNotificationController], providers: [PaymentConfigService, CommerceService, CommercePaymentService, WechatPayClient] })
export class CommerceModule {}
