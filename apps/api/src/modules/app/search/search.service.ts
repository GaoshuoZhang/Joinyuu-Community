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

/** 身份摘要（可见范围判定用） */
interface IdentitySummary {
  type: string
  level: number | null
}

/* 全域聚合搜索（M2-R R2 GET /api/app/search）：
 * keyword 必填（400）；一次算 6 域 count；按 type 返回当前域分页结果。
 * 需求与活动的可见范围（visibilityIdentities/visibilityLevels）与列表页同口径过滤，避免搜索成为越权读取入口。 */
@Injectable()
export class AppSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(uid: string | undefined, keyword: string, type?: string, page = 1, pageSize = 10): Promise<SearchResultDto> {
    const kw = keyword?.trim()
    if (!kw) throw new BadRequestException('请输入搜索关键词')

    const p = Math.max(1, Number.isFinite(page) ? page : 1)
    const s = Math.min(20, Math.max(1, Number.isFinite(pageSize) ? pageSize : 10))

    const identities = await this.loadIdentities(uid)
    const [demand, event, article, enterprise, space, talent] = await Promise.all([
      this.countDemands(kw, identities),
      this.countEvents(kw, identities),
      this.countArticles(kw),
      this.countEnterprises(kw),
      this.countSpaces(kw),
      this.countTalents(kw),
    ])
    const counts: SearchCountsDto = { demand, event, article, enterprise, space, talent }

    let list: Record<string, unknown>[] = []
    if (type) {
      if (!DOMAINS.includes(type as SearchDomain)) throw new BadRequestException('搜索类型无效')
      list = await this.listDomain(type as SearchDomain, kw, p, s, identities)
    }

    return { counts, list, keyword: kw }
  }

  /* ---------- 各域 count ---------- */

  private countDemands(kw: string, identities: IdentitySummary[]): Promise<number> {
    return this.prisma.demand.count({ where: this.demandWhere(kw, identities) })
  }

  private countEvents(kw: string, identities: IdentitySummary[]): Promise<number> {
    return this.prisma.communityEvent.count({ where: this.eventWhere(kw, identities) })
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
    return this.prisma.user.count({ where: this.talentWhere(kw) })
  }

  private talentWhere(kw: string): Prisma.UserWhereInput {
    return {
      status: 'active',
      identities: { some: { type: 'community_individual' } },
      individualCard: { isNot: null },
      OR: [{ nickname: { contains: kw } }, { individualCard: { displayName: { contains: kw } } }],
    }
  }

  /* ---------- 各域分页 list ---------- */

  private async listDomain(
    type: SearchDomain,
    kw: string,
    page: number,
    pageSize: number,
    identities: IdentitySummary[],
  ): Promise<Record<string, unknown>[]> {
    switch (type) {
      case 'demand': {
        const rows = await this.prisma.demand.findMany({
          where: this.demandWhere(kw, identities),
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
            where: this.eventWhere(kw, identities),
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
        return rows.map((e) => ({ id: e.id, name: e.name, industry: e.industry, size: e.size, description: e.description }))
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
        const rows = await this.prisma.user.findMany({
          where: this.talentWhere(kw),
          select: { uid: true, nickname: true, avatar: true, individualCard: { select: { displayName: true } } },
          orderBy: { uid: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
        return rows.map((t) => ({ uid: t.uid, name: t.individualCard?.displayName || t.nickname, avatar: t.avatar || undefined }))
      }
    }
  }

  /* ---------- 私有辅助 ---------- */

  /** 需求可见范围（与需求列表同口径：按单个身份联合判定，多身份取并集；两组都为空 = 不限） */
  private demandWhere(kw: string, identities: IdentitySummary[]): Prisma.DemandWhereInput {
    return {
      status: 'published',
      deletedAt: null,
      title: { contains: kw },
      AND: [this.demandVisibilityCond(identities)],
    }
  }

  private demandVisibilityCond(identities: IdentitySummary[]): Prisma.DemandWhereInput {
    if (identities.length === 0) {
      return { visibilityIdentities: { isEmpty: true }, visibilityLevels: { isEmpty: true } }
    }
    const branches: Prisma.DemandWhereInput[] = identities.map((i) => {
      const typeCond: Prisma.DemandWhereInput = {
        OR: [{ visibilityIdentities: { isEmpty: true } }, { visibilityIdentities: { has: i.type } }],
      }
      const levelCond: Prisma.DemandWhereInput =
        i.level != null
          ? { OR: [{ visibilityLevels: { isEmpty: true } }, { visibilityLevels: { has: String(i.level) } }] }
          : { visibilityLevels: { isEmpty: true } }
      return { AND: [typeCond, levelCond] }
    })
    return { OR: branches }
  }

  /** 活动可见范围（与活动列表同口径） */
  private eventWhere(kw: string, identities: IdentitySummary[]): Prisma.CommunityEventWhereInput {
    return {
      status: 'published',
      deletedAt: null,
      title: { contains: kw },
      AND: [this.eventVisibilityCond(identities)],
    }
  }

  private eventVisibilityCond(identities: IdentitySummary[]): Prisma.CommunityEventWhereInput {
    if (identities.length === 0) {
      return { visibilityIdentities: { isEmpty: true }, visibilityLevels: { isEmpty: true } }
    }
    const branches: Prisma.CommunityEventWhereInput[] = identities.map((i) => {
      const typeCond: Prisma.CommunityEventWhereInput = {
        OR: [{ visibilityIdentities: { isEmpty: true } }, { visibilityIdentities: { has: i.type } }],
      }
      const levelCond: Prisma.CommunityEventWhereInput =
        i.level != null
          ? { OR: [{ visibilityLevels: { isEmpty: true } }, { visibilityLevels: { has: String(i.level) } }] }
          : { visibilityLevels: { isEmpty: true } }
      return { AND: [typeCond, levelCond] }
    })
    return { OR: branches }
  }

  /** 当前登录用户身份（无 uid 视为无身份，按最严格可见范围处理） */
  private loadIdentities(uid?: string): Promise<IdentitySummary[]> {
    if (!uid) return Promise.resolve([])
    return this.prisma.userIdentity.findMany({
      where: { userId: uid },
      select: { type: true, level: true },
    })
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
