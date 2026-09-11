import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Announcement, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import type { QueryAnnouncementsDto } from './dto/query-announcements.dto'
import type { AnnouncementPayloadDto } from './dto/announcement-payload.dto'

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
  return dto
}

/* 公告栏（wiki-backend.md §7.14）：新增即发布，支持下架/重新发布/置顶/删除；全部写操作留痕（内容管理）。 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

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

  async create(payload: AnnouncementPayloadDto, operator: string): Promise<Record<string, unknown>> {
    const now = formatNow()
    const announcement = await this.prisma.announcement.create({
      data: {
        id: await this.ids.next('AN'),
        title: payload.title.trim(),
        content: sanitizeHtml(payload.content).trim(),
        pinned: payload.pinned,
        status: 'published',
        publishedAt: now,
        createdAt: now,
        updatedAt: null,
      },
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

    await this.prisma.announcement.update({
      where: { id },
      data: {
        title,
        content,
        pinned: payload.pinned,
        updatedAt: formatNow(),
      },
    })

    await this.audit.record({
      module: '内容管理',
      action: '编辑公告',
      target: `${item.id} · ${title}`,
      before: { title: item.title, content: item.content, pinned: item.pinned },
      after: { title, content, pinned: payload.pinned },
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
      data: { status: 'withdrawn', updatedAt: now, archivableAt: now },
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

    await this.prisma.announcement.update({
      where: { id },
      data: { pinned, updatedAt: formatNow() },
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
