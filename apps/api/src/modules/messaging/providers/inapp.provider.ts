import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { formatNow } from '../../../common/utils/time'
import { sanitizePlainText } from '../../../common/utils/sanitize-html'
import { MessageSendError, type MessageProvider } from './message-provider'
import type { ChannelKind, SendMessageInput, SendMessageResult } from '../messaging.types'

/** 站内信驱动：写入用户站内信（UserNotification），与 /api/app/notices 同源 */
export class InAppProvider implements MessageProvider {
  readonly provider = 'inapp'
  readonly supports: readonly ChannelKind[] = ['inapp']

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const userId = input.recipient.trim()
    if (!userId) throw new MessageSendError('站内信缺少收件人（uid）', false)

    const user = await this.prisma.user.findUnique({ where: { uid: userId }, select: { uid: true } })
    if (!user) throw new MessageSendError(`站内信收件用户不存在：${userId}`, false)

    const id = await this.ids.next('UN')
    await this.prisma.userNotification.create({
      data: {
        id,
        userId,
        type: (input.variables.noticeType || 'system').slice(0, 32),
        title: (input.subject?.trim() || input.variables.title || input.templateCode).slice(0, 128),
        /* 站内信按纯文本展示：落库前清洗标签（防存储型 XSS）并按列长截断 */
        content: sanitizePlainText(input.body).slice(0, 255),
        link: input.variables.link ? input.variables.link.slice(0, 128) : null,
        at: formatNow(),
      },
    })
    return { providerMessageId: id }
  }
}
