import { Injectable } from '@nestjs/common'
import type { UserNotification } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { formatNow } from '../../../common/utils/time'
import { NOTICE_TYPE_CATALOG } from '../../../common/notify/notification-types'

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

export interface NoticePreferencesDto {
  types: { type: string; label: string; mutable: boolean; muted: boolean }[]
  mutedTypes: string[]
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

  /** 通知偏好：返回类型目录（含可静音标记与当前状态） */
  async preferences(userId: string): Promise<NoticePreferencesDto> {
    const row = await this.prisma.userNotificationPreference.findUnique({ where: { userId } })
    const mutedTypes = row?.mutedTypes ?? []
    return {
      types: NOTICE_TYPE_CATALOG.map((item) => ({ ...item, muted: mutedTypes.includes(item.type) })),
      mutedTypes,
    }
  }

  /** 保存静音类型（仅可配置类型；服务端二次过滤，system 等安全通知始终放行）。 */
  async updatePreferences(userId: string, mutedTypes: string[]): Promise<NoticePreferencesDto> {
    const mutable = new Set(NOTICE_TYPE_CATALOG.filter((item) => item.mutable).map((item) => item.type))
    const next = [...new Set(mutedTypes)].filter((type) => mutable.has(type))
    await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, mutedTypes: next, updatedAt: formatNow() },
      update: { mutedTypes: next, updatedAt: formatNow() },
    })
    return this.preferences(userId)
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
