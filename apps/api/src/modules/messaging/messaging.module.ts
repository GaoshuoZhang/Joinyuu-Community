import { Module } from '@nestjs/common'
import { MessageChannelController } from './message-channel.controller'
import { MessageChannelService } from './message-channel.service'
import { MessageTemplateController } from './message-template.controller'
import { MessageTemplateService } from './message-template.service'
import { MessageRenderService } from './message-render.service'
import { OutboxController } from './outbox.controller'
import { OutboxService } from './outbox.service'
import { SmsCodeService } from './sms-code.service'
import { EmailCodeService } from './email-code.service'
import { MessageProviderRegistry } from './providers/provider.registry'

/* 消息中心（P0）：渠道配置 + 模板中心（版本化/审批/回滚）+ 发送队列（幂等/重试/死信/投递日志）+ 短信/邮箱验证码。
 * Prisma/发号器/审计/Redis 均为 @Global，无需在此显式导入。 */
@Module({
  controllers: [MessageChannelController, MessageTemplateController, OutboxController],
  providers: [
    MessageChannelService,
    MessageTemplateService,
    MessageRenderService,
    OutboxService,
    SmsCodeService,
    EmailCodeService,
    MessageProviderRegistry,
  ],
  exports: [
    MessageChannelService,
    MessageTemplateService,
    MessageRenderService,
    OutboxService,
    SmsCodeService,
    EmailCodeService,
    MessageProviderRegistry,
  ],
})
export class MessagingModule {}
