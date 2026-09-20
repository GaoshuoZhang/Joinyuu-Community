import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { AliyunSmsProvider, TencentSmsProvider } from './sms.providers'
import { SmtpEmailProvider } from './email.provider'
import { InAppProvider } from './inapp.provider'
import { DryRunMessageProvider } from './dry-run.provider'
import type { MessageProvider } from './message-provider'

/** 驱动注册表：按 provider 标识解析实现；发送方（Outbox/测试发送）只依赖此接口 */
@Injectable()
export class MessageProviderRegistry {
  private readonly providers = new Map<string, MessageProvider>()

  constructor(prisma: PrismaService, ids: IdGeneratorService) {
    const implementations: MessageProvider[] = [
      new AliyunSmsProvider(),
      new TencentSmsProvider(),
      new SmtpEmailProvider(),
      new InAppProvider(prisma, ids),
      new DryRunMessageProvider(),
    ]
    for (const impl of implementations) this.providers.set(impl.provider, impl)
  }

  resolve(provider: string): MessageProvider {
    const impl = this.providers.get(provider)
    if (!impl) throw new NotFoundException(`未知消息驱动：${provider}`)
    return impl
  }

  /** 凭据缺失时的降级驱动（仅非生产环境使用，保证开发/测试可端到端验证） */
  dryRun(): MessageProvider {
    return this.resolve('dry_run')
  }
}
