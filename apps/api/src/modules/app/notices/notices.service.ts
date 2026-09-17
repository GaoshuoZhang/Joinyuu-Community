import { Injectable } from '@nestjs/common'
import type { UserNotification } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'

/** 站内信列表项 */
export interface NoticeItemDto {
  id: string
  type: string
  title: string
  content: string
  link: string | null
  at: string
  read: boolean
}

export interface NoticesPageDto {
  list: NoticeItemDto[]
  total: number
  unreadCount: number
}

/* 站内信按时间倒序返回，并保留未读、已读和全部已读动作。 */
@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<NoticesPageDto> {
    const where = { userId }

    const [total, unreadCount, rows] = await Promise.all([
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({ where: { userId, read: false } }),
      this.prisma.userNotification.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return { list: rows.map(this.toItem), total, unreadCount }
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.userNotification.count({
      where: { userId, read: false },
    })
    return { count }
  }

  async markRead(userId: string, id: string): Promise<{ code: number }> {
    /* 幂等：仅更新本人消息；不存在则静默成功 */
    await this.prisma.userNotification.updateMany({
      where: { id, userId, read: false },
      data: { read: true },
    })
    return { code: 0 }
  }

  async markAllRead(userId: string): Promise<{ code: number }> {
    await this.prisma.userNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
    return { code: 0 }
  }

  private toItem(notice: UserNotification): NoticeItemDto {
    return {
      id: notice.id,
      type: notice.type,
      title: notice.title,
      content: notice.content,
      link: notice.link,
      at: notice.at,
      read: notice.read,
    }
  }
}
