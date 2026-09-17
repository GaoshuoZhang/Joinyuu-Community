import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { IdGeneratorService } from '../id-generator/id-generator.service'
import { formatNow } from '../utils/time'
import type { Prisma } from '@prisma/client'

export interface NoticeInput {
  type: string
  title: string
  content: string
  link?: string
}

/** 用户站内信统一出口。失败不抛错，避免通知旁路影响主流程。 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async pushNotice(userId: string, input: NoticeInput): Promise<void> {
    try {
      await this.pushNoticeInTransaction(this.prisma, userId, input)
    } catch (error) {
      console.error(
        '[notify] 站内信写入失败（不阻断主流程）:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  /** 工作人员下架内容时调用；理由为空不发信，举报提交本身不调用此方法。
   * 在删除评论前调用；通知和状态变更随同一事务提交或回滚。
   */
  async notifyContentTakedown(
    tx: Prisma.TransactionClient,
    type: string,
    targetId: string,
    rawReason?: string,
  ): Promise<void> {
    const reason = rawReason?.trim()
    if (!reason) return
    let ownerId: string | null = null
    let title = ''
    if (type === 'demand') {
      const row = await tx.demand.findUnique({ where: { id: targetId }, select: { publisherId: true, title: true } })
      ownerId = row?.publisherId ?? null
      title = row?.title ?? ''
    } else if (type === 'article') {
      const row = await tx.article.findUnique({ where: { id: targetId }, select: { authorId: true, title: true } })
      ownerId = row?.authorId ?? null
      title = row?.title ?? ''
    } else if (type === 'enterprise') {
      const row = await tx.enterprise.findUnique({ where: { id: targetId }, select: { contactUserId: true, name: true } })
      ownerId = row?.contactUserId ?? null
      title = row?.name ?? ''
    } else if (type === 'comment') {
      const row = await tx.articleComment.findUnique({ where: { id: Number(targetId) }, select: { userId: true, content: true } })
      ownerId = row?.userId ?? null
      title = row?.content ?? ''
    }
    if (!ownerId) return
    // 后台代发的内容可能归属于企业 ID；仅通知真实用户，官方内容无收件人。
    let owner = await tx.user.findUnique({ where: { uid: ownerId }, select: { uid: true } })
    if (!owner) {
      const enterprise = await tx.enterprise.findUnique({ where: { id: ownerId }, select: { contactUserId: true } })
      if (enterprise?.contactUserId) {
        owner = await tx.user.findUnique({ where: { uid: enterprise.contactUserId }, select: { uid: true } })
      }
    }
    if (!owner) return
    await this.pushNoticeInTransaction(tx, owner.uid, {
      type: 'audit_result',
      title: `内容下架：${title.slice(0, 100)}`,
      content: reason,
    })
  }

  /** 事务版通知写入：业务要求通知与状态原子提交时使用，错误交给调用方回滚。 */
  async pushNoticeInTransaction(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    input: NoticeInput,
  ): Promise<void> {
    await tx.userNotification.create({
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
  }
}
