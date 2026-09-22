import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Announcement, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import type { QueryAnnouncementsDto } from './dto/query-announcements.dto'
import type { AnnouncementPayloadDto } from './dto/announcement-payload.dto'
import type { HomeAnnouncementPayloadDto } from './dto/home-announcement-payload.dto'

function toAnnouncementDto(a: Announcement): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    id: a.id,
    title: a.title,
    content: a.content,
    pinned: a.pinned,
    status: a.status,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
  }
  if (a.updatedAt != null) dto.updatedAt = a.updatedAt
  if (a.expireAt != null) dto.expireAt = a.expireAt
  if (a.link != null) dto.link = a.link
  return dto
}

/* 首页公告（wiki-backend.md §7.14）：多条目列表管理（列表/新增/编辑/下架/重新发布/启用/删除）；
 * 「启用」即置顶（pinned）——互锁保证全局至多一条开启、允许全关；启用的一条展示在客户端首页搜索栏下方。
 * GET/PUT /home 为兼容单例接口（工作台/旧调用方），新界面不再依赖。写操作留痕。 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  /* 启用互锁：清空其它公告的置顶，保证首页公告条全局至多一条（同一事务内执行） */
  private async clearOtherPinned(tx: Prisma.TransactionClient, keepId?: string): Promise<void> {
    await tx.announcement.updateMany({
      where: { pinned: true, deletedAt: null, ...(keepId ? { id: { not: keepId } } : {}) },
      data: { pinned: false },
    })
  }

  async findAll(query: QueryAnnouncementsDto): Promise<{ list: Record<string, unknown>[]; total: number }> {
    const where: Prisma.AnnouncementWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.status) where.status = query.status

    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        /* 置顶优先，其余按发布时间倒序 */
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.announcement.count({ where }),
    ])
    return { list: rows.map(toAnnouncementDto), total }
  }

  /** 首页公告单例读取：当前开启的一条优先，否则最近一条；无记录返回空表单 */
  async getHomeAnnouncement(): Promise<Record<string, unknown>> {
    const row = await this.prisma.announcement.findFirst({
      where: { deletedAt: null },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
    })
    if (!row) {
      return { id: null, title: '', content: '', enabled: false, link: '', publishedAt: '', updatedAt: '' }
    }
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      enabled: row.pinned && row.status === 'published',
      link: row.link ?? '',
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt ?? '',
    }
  }

  /** 首页公告单例保存（兼容接口）：传 id 时仅更新该条并执行启用互锁；不传时沿用旧行为（覆盖最近一条/首条新建） */
  async saveHomeAnnouncement(payload: HomeAnnouncementPayloadDto, operator: string): Promise<{ code: number }> {
    const now = formatNow()
    const title = payload.title.trim()
    const content = sanitizeHtml(payload.content).trim()
    const link = payload.link?.trim() || null

    const target = payload.id
      ? await this.prisma.announcement.findUnique({ where: { id: payload.id } })
      : await this.prisma.announcement.findFirst({
          where: { deletedAt: null },
          orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        })
    if (payload.id && (!target || target.deletedAt)) throw new NotFoundException('公告不存在')

    let id = target?.id ?? ''
    await this.prisma.$transaction(async (tx) => {
      if (payload.enabled) await this.clearOtherPinned(tx, target?.id)
      if (target) {
        await tx.announcement.update({
          where: { id: target.id },
          data: {
            title,
            content,
            link,
            pinned: payload.enabled,
            status: 'published',
            updatedAt: now,
          },
        })
      } else {
        id = await this.ids.next('AN')
        await tx.announcement.create({
          data: {
            id,
            title,
            content,
            link,
            pinned: payload.enabled,
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: null,
          },
        })
      }
    })

    await this.audit.record({
      module: '内容管理',
      action: '保存首页公告',
      target: id,
      before: target ? { title: target.title, pinned: target.pinned } : undefined,
      after: { title, enabled: payload.enabled },
      operator,
    })
    return { code: 0 }
  }

  async create(payload: AnnouncementPayloadDto, operator: string): Promise<Record<string, unknown>> {
    const now = formatNow()
    const id = await this.ids.next('AN')
    const announcement = await this.prisma.$transaction(async (tx) => {
      /* 置顶公告全局唯一：新增即开启时先取消其他置顶 */
      if (payload.pinned) await this.clearOtherPinned(tx)
      return tx.announcement.create({
        data: {
          id,
          title: payload.title.trim(),
          content: sanitizeHtml(payload.content).trim(),
          pinned: payload.pinned,
          status: 'published',
          publishedAt: now,
          createdAt: now,
          updatedAt: null,
          expireAt: payload.expireAt || null,
          link: payload.link?.trim() || null,
        },
      })
    })

    await this.audit.record({
      module: '内容管理',
      action: '发布公告',
      target: `${announcement.id} · ${announcement.title}`,
      detail: announcement.pinned ? '置顶' : undefined,
      after: { status: announcement.status, pinned: announcement.pinned },
      operator,
    })
    return toAnnouncementDto(announcement)
  }

  async update(id: string, payload: AnnouncementPayloadDto, operator: string): Promise<{ code: number }> {
    const item = await this.prisma.announcement.findUnique({ where: { id } })
    if (!item || item.deletedAt) throw new NotFoundException('公告不存在')
    const title = payload.title.trim()
    const content = sanitizeHtml(payload.content).trim()

    await this.prisma.$transaction(async (tx) => {
      /* 开启置顶时保持全局唯一 */
      if (payload.pinned) await this.clearOtherPinned(tx, id)
      await tx.announcement.update({
        where: { id },
        data: {
          title,
          content,
          pinned: payload.pinned,
          updatedAt: formatNow(),
          expireAt: payload.expireAt || null,
          link: payload.link?.trim() || null,
        },
      })
    })

    await this.audit.record({
      module: '内容管理',
      action: '编辑公告',
      target: `${item.id} · ${title}`,
      before: { title: item.title, content: item.content, pinned: item.pinned, expireAt: item.expireAt, link: item.link },
      after: { title, content, pinned: payload.pinned, expireAt: payload.expireAt, link: payload.link },
      operator,
    })
    return { code: 0 }
  }

  async withdraw(id: string, operator: string): Promise<{ code: number }> {
    const item = await this.prisma.announcement.findUnique({ where: { id } })
    if (!item || item.deletedAt) throw new NotFoundException('公告不存在')
    if (item.status !== 'published') throw new ConflictException('仅已发布公告可下架')

    const now = formatNow()
    await this.prisma.announcement.update({
      where: { id },
      data: { status: 'withdrawn', pinned: false, updatedAt: now, archivableAt: now },
    })

    await this.audit.record({
      module: '内容管理',
      action: '下架公告',
      target: `${item.id} · ${item.title}`,
      before: { status: item.status },
      after: { status: 'withdrawn' },
      operator,
    })
    return { code: 0 }
  }

  async publish(id: string, operator: string): Promise<{ code: number }> {
    const item = await this.prisma.announcement.findUnique({ where: { id } })
    if (!item || item.deletedAt) throw new NotFoundException('公告不存在')
    if (item.status !== 'withdrawn') throw new ConflictException('仅已下架公告可重新发布')

    await this.prisma.announcement.update({
      where: { id },
      data: { status: 'published', publishedAt: formatNow() },
    })

    await this.audit.record({
      module: '内容管理',
      action: '重新发布公告',
      target: `${item.id} · ${item.title}`,
      before: { status: item.status },
      after: { status: 'published' },
      operator,
    })
    return { code: 0 }
  }

  async togglePin(id: string, operator: string): Promise<{ code: number }> {
    const item = await this.prisma.announcement.findUnique({ where: { id } })
    if (!item || item.deletedAt) throw new NotFoundException('公告不存在')
    const pinned = !item.pinned
    /* 启用（置顶）要求已发布：下架内容不得展示在客户端首页，需先重新发布 */
    if (pinned && item.status !== 'published') throw new ConflictException('仅已发布的公告可启用')

    await this.prisma.$transaction(async (tx) => {
      /* 启用互锁：开启本条时取消其他置顶（全局至多一条） */
      if (pinned) await this.clearOtherPinned(tx, id)
      await tx.announcement.update({
        where: { id },
        data: { pinned, updatedAt: formatNow() },
      })
    })

    await this.audit.record({
      module: '内容管理',
      action: pinned ? '公告置顶' : '取消公告置顶',
      target: `${item.id} · ${item.title}`,
      before: { pinned: item.pinned },
      after: { pinned },
      operator,
    })
    return { code: 0 }
  }

  async remove(id: string, operator: string): Promise<{ code: number }> {
    const item = await this.prisma.announcement.findUnique({ where: { id } })
    if (!item || item.deletedAt) throw new NotFoundException('公告不存在')
    if (item.status !== 'withdrawn') throw new ConflictException('仅已下架的公告可归档')

    /* 软删除：移入回收站，可在回收站恢复或彻底删除 */
    await this.prisma.announcement.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '内容管理',
      action: '删除公告',
      target: `${item.id} · ${item.title}`,
      before: { title: item.title, status: item.status },
      operator,
    })
    return { code: 0 }
  }
}
