import { Injectable } from '@nestjs/common'
import type { AdminNotification } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'

/* 通知中心（wiki-backend.md §7.15/§9.2）：业务事件驱动写入，最新在前；单条/全部已读。
 * 通知为管理员维度（单管理员即全局，多账号预留 recipientId）；业务通知由各域服务与定时任务写入。 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.adminNotification.findMany({
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
    })
    return list.map(toNotificationDto)
  }

  /** 标记单条已读：不存在的 id 静默返回（幂等） */
  async markRead(id: string): Promise<{ code: number }> {
    await this.prisma.adminNotification.updateMany({ where: { id }, data: { read: true } })
    return { code: 0 }
  }

  /** 全部已读 */
  async markAllRead(): Promise<{ code: number }> {
    await this.prisma.adminNotification.updateMany({ where: { read: false }, data: { read: true } })
    return { code: 0 }
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
