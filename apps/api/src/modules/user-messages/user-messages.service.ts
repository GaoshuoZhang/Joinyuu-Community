import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, type UserMessage } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { NotificationService } from '../../common/notify/notification.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'
import { sanitizePlainText } from '../../common/utils/sanitize-html'
import type { QueryUserMessagesDto, ReplyMessageDto } from './dto/message.dto'

/* 用户留言（M2-R R4 /api/admin/user-messages）：后台查看客户端留言并回复；
 * 回复写入状态并推送站内信，客户端在「我的 > 我的留言」查看。
 * 归档：已回复留言可归档（写入 deletedAt/deletedBy），在「归档管理 > 用户留言」恢复或彻底删除。 */
@Injectable()
export class UserMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /** 留言列表（默认待回复置顶，其次按提交时间倒序；支持状态与关键词筛选 + 提交时间排序） */
  async findAll(query: QueryUserMessagesDto) {
    const where: Prisma.UserMessageWhereInput = { deletedAt: null }
    const status = query.status?.trim()
    if (status) where.status = status
    const keyword = query.keyword?.trim()
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
        { userId: { contains: keyword, mode: 'insensitive' } },
      ]
    }

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    /* 显式按提交时间排序时放弃「待回复置顶」（用户要求的时间序应纯粹按时间）；否则保持默认口径 */
    const orderBy: Prisma.UserMessageOrderByWithRelationInput[] = query.sortBy === 'createdAt'
      ? [{ createdAt: query.sortOrder === 'ascend' ? 'asc' : 'desc' }]
      : [{ status: 'asc' }, { createdAt: 'desc' }]
    const [total, rows] = await Promise.all([
      this.prisma.userMessage.count({ where }),
      this.prisma.userMessage.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const uids = [...new Set(rows.map((row) => row.userId))]
    const users = uids.length
      ? await this.prisma.user.findMany({
          where: { uid: { in: uids } },
          select: { uid: true, nickname: true, realName: true, phone: true },
        })
      : []
    const byUid = new Map(users.map((user) => [user.uid, user]))

    return { list: rows.map((row) => this.toDto(row, byUid.get(row.userId))), total }
  }

  /** 回复留言：pending → replied 条件更新做幂等守卫；成功后向留言人推送站内信 */
  async reply(id: string, dto: ReplyMessageDto, operator: string): Promise<{ code: number }> {
    const row = await this.prisma.userMessage.findFirst({ where: { id, deletedAt: null } })
    if (!row) throw new NotFoundException('留言不存在')
    if (row.status !== 'pending') throw new ConflictException('该留言已回复')

    /* 回复为纯文本（客户端按文本渲染），故剥标签而非保留富文本 */
    const content = sanitizePlainText(dto.content)
    if (!content) throw new BadRequestException('请填写回复内容')

    const now = formatNow()
    /* 已回复 = 该留言进入可归档状态：同域口径写 archivableAt，供「归档管理」自动归档按延时判定 */
    const claimed = await this.prisma.userMessage.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'replied',
        replyContent: content,
        repliedAt: now,
        repliedBy: operator,
        archivableAt: now,
      },
    })
    if (claimed.count !== 1) throw new ConflictException('该留言已回复')

    await this.notify.pushNotice(row.userId, {
      type: 'system',
      title: '您的留言已回复',
      content: `「${row.title}」已收到社区回复，请在「我的 > 我的留言」查看。`,
      link: '/me/messages',
    })
    return { code: 0 }
  }

  /** 归档留言：仅已回复可归档；写入软删除标记，可在「归档管理 > 用户留言」恢复 */
  async archive(id: string, operator: string): Promise<{ code: number }> {
    const row = await this.prisma.userMessage.findFirst({ where: { id, deletedAt: null } })
    if (!row) throw new NotFoundException('留言不存在')
    if (row.status !== 'replied') throw new ConflictException('仅已回复的留言可归档')

    await this.prisma.userMessage.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '用户留言',
      action: '归档留言',
      target: `${row.id} · ${row.title}`,
      before: { status: row.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  private toDto(
    row: UserMessage,
    user?: { uid: string; nickname: string; realName: string | null; phone: string | null },
  ) {
    return {
      id: row.id,
      userId: row.userId,
      userName: user?.realName || user?.nickname || '—',
      userPhone: user?.phone ?? undefined,
      title: row.title,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
      ...(row.replyContent ? { replyContent: row.replyContent } : {}),
      ...(row.repliedAt ? { repliedAt: row.repliedAt } : {}),
      ...(row.repliedBy ? { repliedBy: row.repliedBy } : {}),
    }
  }
}
