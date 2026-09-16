import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'

/** 搜索域类型 */
export type SearchDomain = 'demand' | 'event' | 'article' | 'enterprise' | 'space' | 'talent'

export interface SearchCountsDto {
  demand: number
  event: number
  article: number
  enterprise: number
  space: number
  talent: number
}

/** 搜索响应：counts 为各域匹配总数（chips 用），list 为当前 type 分页结果（type 省略时为空数组） */
export interface SearchResultDto {
  counts: SearchCountsDto
  list: Record<string, unknown>[]
  keyword: string
}

const DOMAINS: SearchDomain[] = ['demand', 'event', 'article', 'enterprise', 'space', 'talent']

/* 全域聚合搜索（M2-R R2 GET /api/app/search）：
 * keyword 必填（400）；一次算 6 域 count；按 type 返回当前域分页结果。 */
@Injectable()
export class AppSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(keyword: string, type?: string, page = 1, pageSize = 10): Promise<SearchResultDto> {
    const kw = keyword?.trim()
    if (!kw) throw new BadRequestException('请输入搜索关键词')

    const p = Math.max(1, Number.isFinite(page) ? page : 1)
    const s = Math.min(20, Math.max(1, Number.isFinite(pageSize) ? pageSize : 10))

    const [demand, event, article, enterprise, space, talent] = await Promise.all([
      this.countDemands(kw),
      this.countEvents(kw),
      this.countArticles(kw),
      this.countEnterprises(kw),
      this.countSpaces(kw),
      this.countTalents(kw),
    ])
    const counts: SearchCountsDto = { demand, event, article, enterprise, space, talent }

    let list: Record<string, unknown>[] = []
    if (type) {
      if (!DOMAINS.includes(type as SearchDomain)) throw new BadRequestException('搜索类型无效')
      list = await this.listDomain(type as SearchDomain, kw, p, s)
    }

    return { counts, list, keyword: kw }
  }

  /* ---------- 各域 count ---------- */

  private countDemands(kw: string): Promise<number> {
    return this.prisma.demand.count({ where: this.demandWhere(kw) })
  }

  private countEvents(kw: string): Promise<number> {
    return this.prisma.communityEvent.count({ where: this.eventWhere(kw) })
  }

  private countArticles(kw: string): Promise<number> {
    return this.prisma.article.count({ where: this.articleWhere(kw) })
  }

  private countEnterprises(kw: string): Promise<number> {
    return this.prisma.enterprise.count({ where: { name: { contains: kw }, deletedAt: null } })
  }

  private countSpaces(kw: string): Promise<number> {
    return this.prisma.space.count({
      where: { name: { contains: kw }, needReservation: true, status: 'available', deletedAt: null },
    })
  }

  private countTalents(kw: string): Promise<number> {
    return this.prisma.userIdentity.count({
      where: { type: 'community_individual', user: { nickname: { contains: kw } } },
    })
  }

  /* ---------- 各域分页 list ---------- */

  private async listDomain(type: SearchDomain, kw: string, page: number, pageSize: number): Promise<Record<string, unknown>[]> {
    switch (type) {
      case 'demand': {
        const rows = await this.prisma.demand.findMany({
          where: this.demandWhere(kw),
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
        const resps = await this.countResponses(rows.map((d) => d.id))
        return rows.map((d) => {
          const item: Record<string, unknown> = {
            id: d.id,
            title: d.title,
            description: d.description,
            status: d.status,
            publisherName: d.publisherName,
            publisherIdentity: identityOf(d.publisherIdentity),
            deadline: d.deadline || undefined,
            deliverBy: d.deliverBy || undefined,
            responseCount: resps.get(d.id) ?? 0,
            createdAt: d.createdAt,
          }
          return item
        })
      }
      case 'event':
        return (
          await this.prisma.communityEvent.findMany({
            where: this.eventWhere(kw),
            orderBy: { startTime: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        ).map((e) => ({ id: e.id, title: e.title, type: e.type, startTime: e.startTime, endTime: e.endTime, location: e.location, capacity: e.capacity, status: e.status }))
      case 'article':
        return (
          await this.prisma.article.findMany({
            where: this.articleWhere(kw),
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        ).map((a) => ({ id: a.id, title: a.title, columnLabel: a.columnName, authorName: a.authorName, publishedAt: a.publishedAt ?? a.createdAt, views: a.views, summary: a.summary }))
      case 'enterprise': {
        const rows = await this.prisma.enterprise.findMany({
          where: { name: { contains: kw }, deletedAt: null },
          orderBy: { name: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
        return rows.map((e) => ({ id: e.id, name: e.name, industry: e.industry, size: e.size, description: e.description, showcaseStatus: e.showcaseStatus }))
      }
      case 'space':
        return (
          await this.prisma.space.findMany({
            where: { name: { contains: kw }, needReservation: true, status: 'available', deletedAt: null },
            orderBy: { name: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        ).map((s) => ({ id: s.id, name: s.name, location: s.location, capacity: s.capacity, status: 'open' }))
      case 'talent': {
        const rows = await this.prisma.userIdentity.findMany({
          where: { type: 'community_individual', user: { nickname: { contains: kw } } },
          include: { user: { select: { uid: true, nickname: true, avatar: true, realName: true } } },
          take: pageSize,
        })
        return rows.map((t) => ({ uid: t.user.uid, name: t.user.realName || t.user.nickname, avatar: t.user.avatar || undefined }))
      }
    }
  }

  /* ---------- 私有辅助 ---------- */

  private demandWhere(kw: string): Prisma.DemandWhereInput {
    return { status: 'published', deletedAt: null, title: { contains: kw } }
  }

  private eventWhere(kw: string): Prisma.CommunityEventWhereInput {
    return { status: 'published', deletedAt: null, title: { contains: kw } }
  }

  private articleWhere(kw: string): Prisma.ArticleWhereInput {
    return { status: 'published', deletedAt: null, title: { contains: kw } }
  }

  private async countResponses(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (!ids.length) return map
    const rows = await this.prisma.demandRespondent.groupBy({
      by: ['demandId'],
      where: { demandId: { in: ids } },
      _count: { _all: true },
    })
    for (const r of rows) map.set(r.demandId, r._count._all)
    return map
  }
}

function identityOf(json: Prisma.JsonValue | null): string {
  if (!json || typeof json !== 'object') return 'individual'
  return String((json as { type?: unknown }).type ?? 'individual')
}