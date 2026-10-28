import { Module } from '@nestjs/common'
import { PaymentConfigService } from './payment-config.service'
import { PaymentConfigController } from './payment-config.controller'
import { CommerceController, WechatNotificationController } from './commerce.controller'
import { CommerceService } from './commerce.service'
import { CommercePaymentService } from './commerce-payment.service'
import { CommerceFulfillmentService } from './commerce-fulfillment.service'
import { WechatPayClient } from './wechat-pay.client'
import { AppCommerceController, AppCommerceMeController, WechatOauthController } from './app-commerce.controller'
import { AppCommerceService } from './app-commerce.service'

@Module({
  controllers: [
    PaymentConfigController,
    CommerceController,
    WechatNotificationController,
    AppCommerceController,
    AppCommerceMeController,
    WechatOauthController,
  ],
  providers: [PaymentConfigService, CommerceService, CommercePaymentService, CommerceFulfillmentService, AppCommerceService, WechatPayClient],
  exports: [CommerceService, CommercePaymentService, CommerceFulfillmentService, WechatPayClient],
})
export class CommerceModule {}
