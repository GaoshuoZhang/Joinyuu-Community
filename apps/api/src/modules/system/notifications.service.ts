import { Injectable } from '@nestjs/common'
import type { AdminNotification, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'

/* 通知中心（wiki-backend.md §7.15/§9.2）：业务事件驱动写入，最新在前；单条/全部已读。
 * BE-M4 修复：所有端点按收件人归属过滤——全局广播（recipientId 为空，定时任务/系统事件）
 * + 当前管理员的定向通知；无权限账号拿不到任何通知。 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(username?: string): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.adminNotification.findMany({
      where: await this.recipientScope(username),
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
    })
    return list.map(toNotificationDto)
  }

  /** 标记单条已读：仅可标记本人可见的通知；不存在的 id 静默返回（幂等） */
  async markRead(id: string, username?: string): Promise<{ code: number }> {
    await this.prisma.adminNotification.updateMany({
      where: { id, ...(await this.recipientScope(username)) },
      data: { read: true },
    })
    return { code: 0 }
  }

  /** 全部已读（仅本人可见范围） */
  async markAllRead(username?: string): Promise<{ code: number }> {
    await this.prisma.adminNotification.updateMany({
      where: { ...(await this.recipientScope(username)), read: false },
      data: { read: true },
    })
    return { code: 0 }
  }

  /** 收件人过滤：全局广播 + 当前管理员定向通知；管理员不存在时放行空集 */
  private async recipientScope(username?: string): Promise<Prisma.AdminNotificationWhereInput> {
    if (!username) return {}
    const admin = await this.prisma.adminUser.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!admin) return { recipientId: { not: null } }
    return { OR: [{ recipientId: null }, { recipientId: String(admin.id) }] }
  }
}

function toNotificationDto(n: AdminNotification): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    id: n.id,
    type: n.type,
    title: n.title,
    content: n.content,
    at: n.at,
    read: n.read,
  }
  if (n.link != null) dto.link = n.link
  return dto
}