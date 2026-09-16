import { Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../../common/prisma/prisma.service'

/** Json 列读取为数组（空/非数组回退 []，原样返回） */
function asArray(value: Prisma.JsonValue): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 社区域（M2-R R3 /api/app/community）：社区政策 / 人才库 / 公开人才名片 / 企业库 */
@Injectable()
export class AppCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 社区政策列表（kind=community 且已发布；featured 优先、发布时间倒序；数组非分页） */
  async policies(keyword?: string, category?: string) {
    const kw = keyword?.trim()
    const cat = category?.trim()
    const rows = await this.prisma.policy.findMany({
      where: {
        kind: 'community',
        status: 'published',
        ...(kw
          ? { OR: [{ title: { contains: kw } }, { summary: { contains: kw } }, { content: { contains: kw } }] }
          : {}),
        ...(cat ? { category: cat } : {}),
      },
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
    })
    return rows.map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      summary: p.summary,
      content: p.content,
      updatedAt: p.updatedAt,
      version: p.version,
      effectiveAt: p.effectiveAt ?? undefined,
      publisher: p.publisher,
      attachments: asArray(p.attachments),
    }))
  }

  /** 人才库：有社区个体身份且存在 IndividualCard 的用户（keyword 模糊匹配昵称/简介/技能） */
  async talents(keyword?: string, authorization?: string) {
    const kw = keyword?.trim()
    const blockedUids = await this.blockedUids(await this.optionalUid(authorization))
    const users = await this.prisma.user.findMany({
      where: {
        identities: { some: { type: 'community_individual' } },
        individualCard: { isNot: null },
        ...(blockedUids.length ? { uid: { notIn: blockedUids } } : {}),
        ...(kw
          ? {
              OR: [
                { nickname: { contains: kw } },
                { individualCard: { intro: { contains: kw } } },
                { individualCard: { skills: { has: kw } } },
              ],
            }
          : {}),
      },
      include: {
        identities: { where: { type: 'community_individual' }, orderBy: { id: 'asc' } },
        individualCard: true,
      },
      orderBy: { uid: 'asc' },
    })
    const list: { uid: string; name: string; role: string; avatar?: string; intro: string; skills: string[] }[] = []
    for (const u of users) {
      const card = u.individualCard
      if (!card) continue
      /* Prisma 列表 has 仅精确匹配，技能子串命中在内存复核（与客户端 Mock 行为一致） */
      if (kw && !(u.nickname.includes(kw) || card.intro.includes(kw) || card.skills.some((s) => s.includes(kw)))) continue
      list.push({
        uid: u.uid,
        name: u.nickname,
        role: u.identities[0]?.title ?? '',
        avatar: u.avatar ?? undefined,
        intro: card.intro,
        skills: card.skills,
      })
    }
    return list
  }

  /** 公开人才名片（简历式分段；visibility 隐私开关为 false 的字段整体不下发） */
  async talentCard(uid: string, authorization?: string) {
    const blockedUids = await this.blockedUids(await this.optionalUid(authorization))
    if (blockedUids.includes(uid)) throw new NotFoundException('该用户尚未公开名片')
    const user = await this.prisma.user.findUnique({
      where: { uid },
      include: {
        identities: { where: { type: 'community_individual' }, orderBy: { id: 'asc' } },
        individualCard: true,
      },
    })
    const card = user?.individualCard
    if (!user || !card || user.identities.length === 0) throw new NotFoundException('该用户尚未公开名片')

    const identity = user.identities[0]
    const tier = identity?.level != null ? await this.prisma.levelTier.findUnique({ where: { level: identity.level } }) : null
    const visibility = (card.visibility ?? {}) as { age?: boolean; politicalStatus?: boolean }

    return {
      uid: user.uid,
      name: user.nickname,
      avatar: user.avatar ?? undefined,
      level: identity?.level ?? undefined,
      levelName: tier?.label ?? undefined,
      intro: card.intro,
      industryExperience: card.industryExperience ?? undefined,
      skills: card.skills,
      education: asArray(card.education),
      work: asArray(card.work),
      projects: asArray(card.projects),
      honors: asArray(card.honors),
      socials: asArray(card.socials),
      customLinks: asArray(card.customLinks),
      /* 隐私过滤：开关字段本身绝不出现在响应中 */
      ...(visibility.age !== false && card.age != null ? { age: String(card.age) } : {}),
      ...(visibility.politicalStatus !== false && card.politicalStatus ? { politicalStatus: card.politicalStatus } : {}),
    }
  }

  /** 企业库：showcaseStatus=published 且未归档的社区企业（成员由 community_enterprise 身份派生） */
  async enterprises(keyword?: string, industry?: string, authorization?: string) {
    const kw = keyword?.trim()
    const ind = industry?.trim()
    const blockedUids = await this.blockedUids(await this.optionalUid(authorization))
    const rows = await this.prisma.enterprise.findMany({
      where: {
        showcaseStatus: 'published',
        deletedAt: null,
        ...(kw ? { OR: [{ name: { contains: kw } }, { description: { contains: kw } }] } : {}),
        ...(ind ? { industry: ind } : {}),
      },
      orderBy: { id: 'asc' },
    })

    const identities = rows.length
      ? await this.prisma.userIdentity.findMany({
          where: { type: 'community_enterprise', enterpriseId: { in: rows.map((e) => e.id) } },
          include: { user: { select: { uid: true, realName: true, nickname: true } } },
          orderBy: { id: 'asc' },
        })
      : []
    const membersByEnterprise = new Map<string, { uid?: string; name: string; role?: string; phone?: string; permissions?: string[] }[]>()
    for (const identity of identities) {
      const key = identity.enterpriseId ?? ''
      if (!key) continue
      const list = membersByEnterprise.get(key) ?? []
      list.push({
        uid: identity.user?.uid,
        name: identity.user ? identity.user.realName || identity.user.nickname : '',
        role: identity.title,
        phone: identity.memberPhone ?? undefined,
        ...(identity.permissions.length ? { permissions: identity.permissions } : {}),
      })
      membersByEnterprise.set(key, list)
    }

    return rows.filter((e) => !e.contactUserId || !blockedUids.includes(e.contactUserId)).map((e) => ({
      id: e.id,
      name: e.name,
      logo: e.logo ?? undefined,
      industry: e.industry,
      size: e.size,
      foundedAt: e.foundedAt || undefined,
      website: e.website ?? undefined,
      address: e.address ?? undefined,
      services: e.services.length ? e.services.join('、') : undefined,
      advantages: e.advantages.length ? e.advantages.join('、') : undefined,
      description: e.description,
      showcaseStatus: 'published' as const,
      members: membersByEnterprise.get(e.id) ?? [],
      contactUid: e.contactUserId ?? undefined,
      contactName: e.contactName || undefined,
    }))
  }

  private async optionalUid(authorization?: string): Promise<string | undefined> {
    if (!authorization?.startsWith('Bearer ')) return undefined
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; scope?: string }>(authorization.slice(7))
      return payload.scope === 'app' ? payload.sub : undefined
    } catch {
      return undefined
    }
  }

  private async blockedUids(uid?: string): Promise<string[]> {
    if (!uid) return []
    const rows = await this.prisma.userBlock.findMany({ where: { userId: uid }, select: { blockedUid: true } })
    return rows.map((row) => row.blockedUid)
  }
}
