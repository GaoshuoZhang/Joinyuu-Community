import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { IdGeneratorService } from '../id-generator/id-generator.service'
import { formatNow } from '../utils/time'

export interface NoticeInput {
  type: string
  title: string
  content: string
  link?: string
}

/** 用户站内信统一出口（M2-R R1）：
 * 写入前按 UserNotificationPreference 过滤（"all" 或含该 type 才下发）；
 * 无偏好记录时默认全量下发。失败不抛错（通知为旁路，不影响主流程）。 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async pushNotice(userId: string, input: NoticeInput): Promise<void> {
    try {
      const pref = await this.prisma.userNotificationPreference.findUnique({
        where: { userId },
      })
      if (pref) {
        const enabled = (pref.enabledTypes ?? []) as string[]
        if (!enabled.includes('all') && !enabled.includes(input.type)) return
      }
      await this.prisma.userNotification.create({
        data: {
          id: await this.ids.next('UN'),
          userId,
          type: input.type,
          title: input.title,
          content: input.content,
          link: input.link ?? null,
          at: formatNow(),
        },
      })
    } catch (error) {
      console.error(
        '[notify] 站内信写入失败（不阻断主流程）:',
        error instanceof Error ? error.message : error,
      )
    }
  }
}