import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { formatNow } from '../../../common/utils/time'
import type { CreateReportDto } from './dto/create-report.dto'

/** 举报与屏蔽（M2-R R3，/api/app/reports 与 /api/app/me/**）：
 * 举报（同举报人同对象 pending 去重，RP 前缀）、我的举报记录、屏蔽名单（幂等增删）。 */
@Injectable()
export class AppReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  /** 提交举报：同一举报人对同一对象已有待处理举报时 409，否则写 RP 记录 */
  async createReport(uid: string, dto: CreateReportDto): Promise<{ code: number }> {
    const target = await this.resolveTarget(dto.targetType, dto.targetId, uid)
    const duplicate = await this.prisma.report.findFirst({
      where: { reporterId: uid, targetType: dto.targetType, targetId: dto.targetId, status: 'pending' },
      select: { id: true },
    })
    if (duplicate) throw new ConflictException('已提交过举报，请等待处理')

    await this.prisma.report.create({
      data: {
        id: await this.ids.next('RP'),
        reporterId: uid,
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetTitle: target.title,
        reason: dto.reason.trim(),
        detail: dto.detail?.trim() || null,
        status: 'pending',
        at: formatNow(),
      },
    })
    return { code: 0 }
  }

  /** 我的举报记录（at 倒序，含处理状态） */
  async myReports(uid: string) {
    const rows = await this.prisma.report.findMany({
      where: { reporterId: uid },
      orderBy: { at: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      targetTitle: r.targetTitle,
      reason: r.reason,
      detail: r.detail ?? undefined,
      status: r.status,
      at: r.at,
    }))
  }

  /** 屏蔽名单（被屏蔽者 uid + 昵称；createdAt 倒序） */
  async blocklist(uid: string): Promise<{ uid: string; name: string }[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
    })
    if (!blocks.length) return []
    const users = await this.prisma.user.findMany({
      where: { uid: { in: blocks.map((b) => b.blockedUid) } },
      select: { uid: true, nickname: true },
    })
    const nameByUid = new Map(users.map((u) => [u.uid, u.nickname]))
    return blocks.map((b) => ({ uid: b.blockedUid, name: nameByUid.get(b.blockedUid) ?? b.blockedUid }))
  }

  /** 屏蔽用户：不能屏蔽自己、目标用户必须存在，重复屏蔽幂等 */
  async block(uid: string, rawTargetUid: string): Promise<{ code: number }> {
    const targetUid = rawTargetUid.trim()
    if (targetUid === uid) throw new BadRequestException('不能屏蔽自己')
    const target = await this.prisma.user.findUnique({ where: { uid: targetUid }, select: { uid: true } })
    if (!target) throw new NotFoundException('用户不存在')

    await this.prisma.userBlock.upsert({
      where: { userId_blockedUid: { userId: uid, blockedUid: targetUid } },
      update: {},
      create: { userId: uid, blockedUid: targetUid, createdAt: formatNow() },
    })
    return { code: 0 }
  }

  /** 取消屏蔽（幂等：记录不存在同样成功） */
  async unblock(uid: string, targetUid: string): Promise<{ code: number }> {
    await this.prisma.userBlock.deleteMany({ where: { userId: uid, blockedUid: targetUid } })
    return { code: 0 }
  }

  /** 举报目标必须真实、可见且类型匹配；标题由服务端快照，不能信任客户端传值。 */
  private async resolveTarget(type: string, rawId: string, reporterUid: string): Promise<{ title: string }> {
    const id = rawId.trim()
    if (!id) throw new NotFoundException('举报对象不存在')
    if (type === 'demand') {
      const row = await this.prisma.demand.findFirst({ where: { id, status: 'published', deletedAt: null }, select: { title: true } })
      if (row) return { title: row.title }
    }
    if (type === 'article') {
      const row = await this.prisma.article.findFirst({ where: { id, status: 'published', deletedAt: null }, select: { title: true } })
      if (row) return { title: row.title }
    }
    if (type === 'enterprise') {
      const row = await this.prisma.enterprise.findFirst({
        where: { id, deletedAt: null },
        select: { name: true },
      })
      if (row) return { title: row.name }
    }
    if (type === 'comment') {
      const commentId = Number.parseInt(id, 10)
      if (Number.isInteger(commentId) && String(commentId) === id) {
        const row = await this.prisma.articleComment.findUnique({ where: { id: commentId }, select: { userId: true, content: true } })
        if (row && row.userId !== reporterUid) return { title: row.content.slice(0, 128) }
      }
    }
    if (type === 'user') {
      if (id === reporterUid) throw new BadRequestException('不能举报自己')
      const row = await this.prisma.user.findUnique({ where: { uid: id }, select: { nickname: true } })
      if (row) return { title: row.nickname }
    }
    throw new NotFoundException('举报对象不存在或不可见')
  }
}
