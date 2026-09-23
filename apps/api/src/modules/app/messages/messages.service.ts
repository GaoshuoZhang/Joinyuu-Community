import { BadRequestException, Injectable } from '@nestjs/common'
import type { UserMessage } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { formatNow } from '../../../common/utils/time'
import { sanitizePlainText } from '../../../common/utils/sanitize-html'
import type { CreateMessageDto } from './dto/create-message.dto'

/* 用户留言（M2-R R4 /api/app/me/messages）：登录用户提交留言、查看自己的留言与后台回复。
 * 后台在「用户留言」页回复，回复时写入状态并推送站内信。 */
@Injectable()
export class AppMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  /** 提交留言：标题/正文清洗后落库，初始状态 pending（待回复）。
   * 主题与正文均为纯文本（客户端与后台均按文本渲染），故用 sanitizePlainText 剥标签。 */
  async create(uid: string, dto: CreateMessageDto): Promise<{ id: string }> {
    const title = sanitizePlainText(dto.title)
    const content = sanitizePlainText(dto.content)
    if (!title) throw new BadRequestException('请填写留言主题')
    if (!content) throw new BadRequestException('请填写留言内容')

    const id = await this.ids.next('UM')
    await this.prisma.userMessage.create({
      data: {
        id,
        userId: uid,
        title,
        content,
        status: 'pending',
        createdAt: formatNow(),
      },
    })
    return { id }
  }

  /** 我的留言（createdAt 倒序，含后台回复内容与回复时间）；已归档（软删除）留言不再下发 */
  async list(uid: string) {
    const rows = await this.prisma.userMessage.findMany({
      where: { userId: uid, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return { list: rows.map((row) => this.toDto(row)), total: rows.length }
  }

  private toDto(row: UserMessage) {
    return {
      id: row.id,
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
