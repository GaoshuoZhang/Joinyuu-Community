import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma, UserNotification } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { formatNow } from '../../../common/utils/time'
import type { NoticePrefsDto } from './dto/notice-prefs.dto'

/** 通知偏好合法类型全集（'all' 为全量开关） */
export const NOTICE_TYPE_SET: readonly string[] = [
  'all',
  'audit_result',
  'enroll_result',
  'order',
  'points',
  'system',
  'invite',
  'transfer',
  'report',
  'article',
  'demand',
  'project',
  'mall',
  'service',
]

/** 站内信列表项 */
export interface NoticeItemDto {
  id: string
  type: string
  title: string
  content: string
  link: string | null
  at: string
  read: boolean
  archived: boolean
}

export interface NoticesPageDto {
  list: NoticeItemDto[]
  total: number
  unreadCount: number
}

/* 站内信读取与通知偏好（M2-R R1）：
 * 列表按 at 倒序、可类型/状态筛选并附带未读数；归档仅允许对已读消息执行；
 * 偏好 upsert 单行 Json 存储，['all'] 或合法 type 子集。 */
@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    page: number,
    pageSize: number,
    status?: string,
    type?: string,
  ): Promise<NoticesPageDto> {
    const allowedTypes = await this.allowedTypes(userId)
    const where = this.buildWhere(userId, status, type, allowedTypes)

    const [total, unreadCount, rows] = await Promise.all([
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({ where: { userId, read: false, archived: false, ...this.typeFilter(allowedTypes) } }),
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
    const allowedTypes = await this.allowedTypes(userId)
    const count = await this.prisma.userNotification.count({
      where: { userId, read: false, archived: false, ...this.typeFilter(allowedTypes) },
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

  async archive(userId: string, id: string, archived: boolean): Promise<{ code: number }> {
    const notice = await this.prisma.userNotification.findFirst({ where: { id, userId } })
    if (!notice) throw new NotFoundException('消息不存在')
    if (archived && !notice.read) throw new BadRequestException('请先标记已读')

    await this.prisma.userNotification.update({ where: { id }, data: { archived } })
    return { code: 0 }
  }

  async getPrefs(userId: string): Promise<{ enabledTypes: string[] }> {
    const pref = await this.prisma.userNotificationPreference.findUnique({ where: { userId } })
    const enabledTypes = (pref?.enabledTypes as string[] | undefined) ?? ['all']
    return { enabledTypes }
  }

  async updatePrefs(userId: string, dto: NoticePrefsDto): Promise<{ code: number }> {
    let enabledTypes = [...dto.enabledTypes]
    /* 合法性校验：所有类型必须在全集内 */
    const invalid = enabledTypes.find((t) => !NOTICE_TYPE_SET.includes(t))
    if (invalid) throw new BadRequestException(`通知类型不存在：${invalid}`)

    /* 含 'all' 时规整为 ['all']（全量） */
    if (enabledTypes.includes('all')) enabledTypes = ['all']

    await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, enabledTypes, updatedAt: formatNow() },
      update: { enabledTypes, updatedAt: formatNow() },
    })
    return { code: 0 }
  }

  private buildWhere(
    userId: string,
    status?: string,
    type?: string,
    allowedTypes?: string[],
  ): Prisma.UserNotificationWhereInput {
    const where: Prisma.UserNotificationWhereInput = { userId, archived: false }
    if (type) where.type = allowedTypes?.includes('all') || allowedTypes?.includes(type) ? type : '__disabled__'
    else Object.assign(where, this.typeFilter(allowedTypes ?? ['all']))
    if (status === 'unread') {
      where.read = false
      where.archived = false
    } else if (status === 'read') {
      where.read = true
      where.archived = false
    } else if (status === 'archived') {
      where.archived = true
    }
    return where
  }

  private async allowedTypes(userId: string): Promise<string[]> {
    const pref = await this.prisma.userNotificationPreference.findUnique({ where: { userId } })
    return (pref?.enabledTypes as string[] | undefined) ?? ['all']
  }

  private typeFilter(enabledTypes: string[]): Prisma.UserNotificationWhereInput {
    return enabledTypes.includes('all') ? {} : { type: { in: enabledTypes } }
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
      archived: notice.archived,
    }
  }
}
