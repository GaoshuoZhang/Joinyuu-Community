import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { formatNow } from '../../../common/utils/time'
import type { ToggleFavoriteDto } from './dto/toggle-favorite.dto'

/** 我的收藏（M2-R R3 /api/app/me/favorites）：列表 + 收藏/取消切换（幂等） */
@Injectable()
export class AppFavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 收藏列表（createdAt 倒序；type 可选过滤 demand|article|event|enterprise|talent） */
  async list(uid: string, type?: string) {
    const t = type?.trim()
    const rows = await this.prisma.favorite.findMany({
      where: { userId: uid, ...(t ? { targetType: t } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map((r) => ({
      id: String(r.id),
      type: r.targetType,
      targetId: r.targetId,
      title: r.title,
      subtitle: r.subtitle ?? undefined,
      at: r.createdAt,
    }))
  }

  /** 收藏切换：已存在则删除返回未收藏；不存在写入快照返回已收藏（P2002 兜底并发幂等） */
  async toggle(uid: string, dto: ToggleFavoriteDto): Promise<{ favorited: boolean }> {
    const existing = await this.prisma.favorite.findFirst({
      where: { userId: uid, targetType: dto.type, targetId: dto.targetId },
      select: { id: true },
    })
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } })
      return { favorited: false }
    }
    const snapshot = await this.resolveTarget(dto.type, dto.targetId)
    try {
      await this.prisma.favorite.create({
        data: {
          userId: uid,
          targetType: dto.type,
          targetId: dto.targetId,
          title: snapshot.title,
          subtitle: snapshot.subtitle ?? null,
          createdAt: formatNow(),
        },
      })
    } catch (e) {
      /* 并发兜底：唯一约束(userId,targetType,targetId) 冲突视为已收藏 */
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { favorited: true }
      throw e
    }
    return { favorited: true }
  }

  /** 收藏快照只从真实的公开目标生成，拒绝伪造 ID/标题。 */
  private async resolveTarget(type: ToggleFavoriteDto['type'], targetId: string): Promise<{ title: string; subtitle?: string }> {
    if (type === 'demand') {
      const row = await this.prisma.demand.findFirst({ where: { id: targetId, status: 'published', deletedAt: null }, select: { title: true, publisherName: true } })
      if (row) return { title: row.title, subtitle: row.publisherName }
    }
    if (type === 'article') {
      const row = await this.prisma.article.findFirst({ where: { id: targetId, status: 'published', deletedAt: null }, select: { title: true, columnName: true } })
      if (row) return { title: row.title, subtitle: row.columnName }
    }
    if (type === 'event') {
      const row = await this.prisma.communityEvent.findFirst({ where: { id: targetId, status: 'published', deletedAt: null }, select: { title: true, type: true } })
      if (row) return { title: row.title, subtitle: row.type }
    }
    if (type === 'enterprise') {
      const row = await this.prisma.enterprise.findFirst({ where: { id: targetId, showcaseStatus: 'published', deletedAt: null }, select: { name: true, industry: true } })
      if (row) return { title: row.name, subtitle: row.industry }
    }
    if (type === 'talent') {
      const row = await this.prisma.user.findFirst({
        where: { uid: targetId, individualCard: { isNot: null }, identities: { some: { type: 'community_individual' } } },
        select: { nickname: true, individualCard: { select: { intro: true } } },
      })
      if (row) return { title: row.nickname, subtitle: row.individualCard?.intro || undefined }
    }
    throw new NotFoundException('收藏对象不存在或不可见')
  }
}
