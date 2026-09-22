import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { AuditService } from '../../../common/audit/audit.service'
import { formatNow, formatToday } from '../../../common/utils/time'
import type { QueryTrashDto } from './dto/query-trash.dto'
import type { UpdateArchiveSettingDto } from './dto/update-archive-setting.dto'

export interface ArchiveItemDto {
  id: string
  domain: string
  domainLabel: string
  title: string
  deletedAt: string
  deletedBy: string
  data: Record<string, unknown>
}

export interface ArchiveSettingDto {
  domain: string
  label: string
  autoArchive: boolean
  autoArchiveSupported: boolean
  archiveDelayDays: number
  autoPurge: boolean
  purgeDelayDays: number
  archivableStatuses: { value: string; label: string; enabled: boolean }[]
}

interface DomainOps {
  label: string
  titleOf: (row: Record<string, unknown>) => string
  listDeleted: () => Promise<Record<string, unknown>[]>
  restore: (id: string) => Promise<void>
  purge: (id: string) => Promise<void>
}

interface SoftModel {
  findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown>
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
  delete: (args: { where: { id: string } }) => Promise<unknown>
}

interface ArchiveStatusDef {
  value: string
  label: string
}

interface DomainDef {
  label: string
  autoArchive: boolean
  archiveStatuses: ArchiveStatusDef[]
}

/* 归档管理：各业务域软删除对象集中管理（来源标签页 + 恢复/彻底删除）。
 * 软删除列 deletedAt/deletedBy 由各域归档端点写入；本模块仅消费与运维。
 * 恢复与彻底删除均限定 deletedAt 非空对象，防止绕过业务状态机对在线记录操作。
 * 自动归档/自动删除由调度器调用 runAutoArchive/runAutoPurge（按 ArchiveSetting 配置）。 */
const ARCHIVE_OPERATOR = '系统自动归档'

/* 标签页顺序（与前端归档管理一致）：社区企业/合作企业/资讯发布/投稿内容/公告栏/需求/项目/活动/租赁/空间预约/商品/商城订单/申请审核 */
const DOMAIN_DEFS: Record<string, DomainDef> = {
  enterprise: { label: '社区企业', autoArchive: false, archiveStatuses: [] },
  externalEnterprise: { label: '合作企业', autoArchive: false, archiveStatuses: [] },
  article: { label: '资讯发布', autoArchive: true, archiveStatuses: [{ value: 'pending_release', label: '待发布' }, { value: 'closed', label: '已关闭' }] },
  submission: {
    label: '投稿内容',
    autoArchive: true,
    archiveStatuses: [
      { value: 'pending_release', label: '待发布' },
      { value: 'rejected', label: '已驳回' },
      { value: 'closed', label: '已关闭' },
    ],
  },
  announcement: { label: '公告栏', autoArchive: true, archiveStatuses: [{ value: 'withdrawn', label: '已下架' }] },
  demand: {
    label: '需求',
    autoArchive: true,
    archiveStatuses: [
      { value: 'rejected', label: '已驳回' },
      { value: 'closed', label: '已关闭' },
      { value: 'projected', label: '已立项' },
    ],
  },
  project: {
    label: '项目',
    autoArchive: true,
    archiveStatuses: [
      { value: 'finished', label: '已结项' },
      { value: 'closed', label: '已关闭' },
    ],
  },
  event: {
    label: '活动',
    autoArchive: true,
    archiveStatuses: [
      { value: 'ended', label: '已结束' },
      { value: 'cancelled', label: '已取消' },
    ],
  },
  lease: { label: '租赁', autoArchive: true, archiveStatuses: [{ value: 'terminated', label: '已终止' }] },
  reservation: {
    label: '空间预约',
    autoArchive: true,
    archiveStatuses: [
      { value: 'ended', label: '已结束' },
      { value: 'rejected', label: '已驳回' },
      { value: 'cancelled', label: '已取消' },
    ],
  },
  goods: { label: '商品', autoArchive: true, archiveStatuses: [{ value: 'off', label: '已下架' }] },
  order: { label: '商城订单', autoArchive: true, archiveStatuses: [{ value: 'finished', label: '已完成' }] },
  application: {
    label: '申请审核',
    autoArchive: true,
    archiveStatuses: [
      { value: 'approved', label: '已通过' },
      { value: 'rejected', label: '已驳回' },
    ],
  },
}

const DOMAIN_ORDER = Object.keys(DOMAIN_DEFS)

@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 支持的归档域（与前端标签页对齐） */
  domains(): { value: string; label: string }[] {
    return DOMAIN_ORDER.map((value) => ({ value, label: DOMAIN_DEFS[value].label }))
  }

  async list(query: QueryTrashDto): Promise<{ list: ArchiveItemDto[]; total: number }> {
    const map = this.domainMap()
    /* 非法域明确报 400，而不是静默返回空列表（前端标签页与域枚举同源，出现即契约不一致） */
    if (query.domain && !DOMAIN_DEFS[query.domain]) throw new BadRequestException('不支持的归档标签页')
    const selected: string[] = query.domain ? [query.domain] : DOMAIN_ORDER

    const rows: ArchiveItemDto[] = []
    for (const domain of selected) {
      const ops = map[domain]
      const deleted = await ops.listDeleted()
      for (const r of deleted) {
        const data = { ...r }
        delete data.deletedAt
        delete data.deletedBy
        rows.push({
          id: String(r.id),
          domain,
          domainLabel: ops.label,
          title: ops.titleOf(r),
          deletedAt: String(r.deletedAt ?? ''),
          deletedBy: String(r.deletedBy ?? ''),
          data,
        })
      }
    }

    const kw = query.keyword?.trim().toLowerCase()
    const filtered = kw
      ? rows.filter((r) => r.title.toLowerCase().includes(kw) || r.id.toLowerCase().includes(kw))
      : rows
    filtered.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0))

    await this.fillGoodsCategoryLabels(rows)

    const start = (query.page - 1) * query.pageSize
    return { list: filtered.slice(start, start + query.pageSize), total: filtered.length }
  }

  /** 商品归档行的 category 存字典编码，附 categoryLabel 供列表展示名称（编码可能随字典调整，故实时回填） */
  private async fillGoodsCategoryLabels(rows: ArchiveItemDto[]): Promise<void> {
    const goodsRows = rows.filter((row) => row.domain === 'goods')
    const codes = [...new Set(goodsRows.map((row) => String(row.data.category ?? '')).filter(Boolean))]
    if (!codes.length) return
    const entries = await this.prisma.dictEntry.findMany({
      where: { type: 'goods_category', code: { in: codes } },
      select: { code: true, label: true },
    })
    const labels = new Map(entries.map((entry) => [entry.code, entry.label]))
    for (const row of goodsRows) {
      const code = String(row.data.category ?? '')
      row.data.categoryLabel = labels.get(code) ?? code
    }
  }

  async restore(domain: string, id: string, operator: string): Promise<{ code: number }> {
    const ops = this.requireDomain(domain)
    try {
      await ops.restore(id)
    } catch (e) {
      /* 仅把「对象不存在」映射为 404；数据库连接/约束等真实故障透传，避免误导为「归档中不存在」 */
      if (e instanceof NotFoundException) throw e
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('归档中不存在该对象')
      }
      throw e
    }
    await this.audit.record({
      module: '归档管理',
      action: '恢复对象',
      target: `${ops.label} · ${id}`,
      detail: `恢复 ${domain}/${id}`,
      operator,
    })
    return { code: 0 }
  }

  async purge(domain: string, id: string, operator: string): Promise<{ code: number }> {
    const ops = this.requireDomain(domain)
    try {
      await ops.purge(id)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') throw new ConflictException('存在关联数据，无法彻底删除')
        if (e.code === 'P2025') throw new NotFoundException('归档中不存在该对象')
      }
      throw e
    }
    await this.audit.record({
      module: '归档管理',
      action: '彻底删除对象',
      target: `${ops.label} · ${id}`,
      detail: `物理删除 ${domain}/${id}`,
      operator,
    })
    return { code: 0 }
  }

  /* ---------- 归档设置 ---------- */

  async listSettings(): Promise<ArchiveSettingDto[]> {
    const saved = await this.prisma.archiveSetting.findMany()
    const byDomain = new Map(saved.map((s) => [s.domain, s]))
    return DOMAIN_ORDER.map((domain) => {
      const s = byDomain.get(domain)
      const savedStatuses = (s?.archiveStatuses ?? {}) as Record<string, boolean>
      return {
        domain,
        label: DOMAIN_DEFS[domain].label,
        autoArchive: s?.autoArchive ?? false,
        autoArchiveSupported: DOMAIN_DEFS[domain].autoArchive,
        archiveDelayDays: s?.archiveDelayDays ?? 7,
        autoPurge: s?.autoPurge ?? false,
        purgeDelayDays: s?.purgeDelayDays ?? 30,
        archivableStatuses: DOMAIN_DEFS[domain].archiveStatuses.map((st) => ({
          value: st.value,
          label: st.label,
          enabled: savedStatuses[st.value] ?? false,
        })),
      }
    })
  }

  async updateSettings(
    domain: string,
    dto: UpdateArchiveSettingDto,
    operator: string,
  ): Promise<ArchiveSettingDto> {
    const def = DOMAIN_DEFS[domain]
    if (!def) throw new NotFoundException('不支持的归档标签页')
    if (!def.autoArchive && dto.autoArchive === true) {
      throw new BadRequestException('该标签页不支持自动归档')
    }
    const supported = new Set(def.archiveStatuses.map((s) => s.value))
    const incoming = dto.archiveStatuses ?? {}
    for (const key of Object.keys(incoming)) {
      if (!supported.has(key)) throw new BadRequestException('不支持的归档状态')
    }
    const existing = await this.prisma.archiveSetting.findUnique({ where: { domain } })
    const savedStatuses = (existing?.archiveStatuses ?? {}) as Record<string, boolean>
    const archiveStatuses: Record<string, boolean> = {}
    for (const st of def.archiveStatuses) {
      archiveStatuses[st.value] = incoming[st.value] ?? savedStatuses[st.value] ?? false
    }
    /* 部分字段提交时按既有设置回填，避免「只改一个开关」把其它设置重置为默认值 */
    const values = {
      autoArchive: def.autoArchive ? (dto.autoArchive ?? existing?.autoArchive ?? false) : false,
      archiveDelayDays: dto.archiveDelayDays ?? existing?.archiveDelayDays ?? 7,
      autoPurge: dto.autoPurge ?? existing?.autoPurge ?? false,
      purgeDelayDays: dto.purgeDelayDays ?? existing?.purgeDelayDays ?? 30,
      archiveStatuses,
    }
    await this.prisma.archiveSetting.upsert({
      where: { domain },
      create: { domain, ...values },
      update: values,
    })
    await this.audit.record({
      module: '归档管理',
      action: '更新归档设置',
      target: def.label,
      detail: `自动归档 ${values.autoArchive ? '开' : '关'} · 延时 ${values.archiveDelayDays} 天 · 自动删除 ${values.autoPurge ? '开' : '关'} · 延时 ${values.purgeDelayDays} 天`,
      operator,
    })
    const settings = await this.listSettings()
    return settings.find((s) => s.domain === domain)!
  }

  /* ---------- 自动归档 / 自动删除（调度器入口） ---------- */

  /** 按设置自动归档：条目进入可归档状态且超过归档延时 → 写入 deletedAt/deletedBy（仅启用状态） */
  async runAutoArchive(): Promise<number> {
    const settings = await this.prisma.archiveSetting.findMany({ where: { autoArchive: true } })
    let total = 0
    const now = formatNow()
    for (const s of settings) {
      const def = DOMAIN_DEFS[s.domain]
      if (!def?.autoArchive) continue
      const cutoff = `${this.addDays(formatToday(), -Math.max(0, s.archiveDelayDays))} 23:59`
      const savedStatuses = (s.archiveStatuses ?? {}) as Record<string, boolean>
      const enabled = def.archiveStatuses
        .filter((st) => savedStatuses[st.value] ?? false)
        .map((st) => st.value)
      total += await this.autoArchiveDomain(s.domain, cutoff, now, enabled)
    }
    return total
  }

  /** 按设置自动删除：归档时间超过删除延时 → 物理删除（外键冲突等跳过） */
  async runAutoPurge(): Promise<number> {
    const settings = await this.prisma.archiveSetting.findMany({ where: { autoPurge: true } })
    let total = 0
    for (const s of settings) {
      const cutoff = `${this.addDays(formatToday(), -Math.max(1, s.purgeDelayDays))} 23:59`
      total += await this.autoPurgeDomain(s.domain, cutoff)
    }
    return total
  }

  private async autoArchiveDomain(
    domain: string,
    cutoff: string,
    now: string,
    enabled: string[],
  ): Promise<number> {
    const db = this.prisma
    const base = { deletedAt: null, archivableAt: { lte: cutoff } }
    switch (domain) {
      case 'demand': {
        const r = await db.demand.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'project': {
        const r = await db.project.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'event': {
        const r = await db.communityEvent.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'lease': {
        const r = await db.lease.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'reservation': {
        const rejectedCancelled = await db.spaceReservation.updateMany({
          where: { ...base, status: { in: enabled.filter((v) => v === 'rejected' || v === 'cancelled') } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        let endedCount = 0
        if (enabled.includes('ended')) {
          const approved = await db.spaceReservation.findMany({
            where: { deletedAt: null, status: 'approved', date: { lte: cutoff.slice(0, 10) } },
            select: { id: true, date: true, endTime: true },
          })
          const endedIds = approved.filter((r) => `${r.date} ${r.endTime}` <= cutoff).map((r) => r.id)
          const ended = endedIds.length
            ? await db.spaceReservation.updateMany({
                where: { id: { in: endedIds } },
                data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
              })
            : { count: 0 }
          endedCount = ended.count
        }
        return rejectedCancelled.count + endedCount
      }
      case 'article': {
        const r = await db.article.updateMany({
          where: { ...base, channel: 'official', status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'submission': {
        const r = await db.article.updateMany({
          where: { ...base, channel: 'submitted', status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'announcement': {
        const r = await db.announcement.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'goods': {
        const r = await db.mallGoods.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'order': {
        const r = await db.redemptionOrder.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      case 'application': {
        const r = await db.application.updateMany({
          where: { ...base, status: { in: enabled } },
          data: { deletedAt: now, deletedBy: ARCHIVE_OPERATOR },
        })
        return r.count
      }
      default:
        return 0
    }
  }

  private async autoPurgeDomain(domain: string, cutoff: string): Promise<number> {
    const ops = this.domainMap()[domain]
    if (!ops) return 0
    const deleted = await ops.listDeleted()
    let count = 0
    for (const r of deleted) {
      if (String(r.deletedAt ?? '') > cutoff) continue
      try {
        await ops.purge(String(r.id))
        count += 1
      } catch {
        /* 外键冲突等场景跳过，等待人工处理 */
      }
    }
    return count
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + days)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  private requireDomain(domain: string): DomainOps {
    const ops = this.domainMap()[domain]
    if (!ops) throw new NotFoundException('不支持的归档标签页')
    return ops
  }

  /** 生成某模型的恢复/彻底删除操作（限定 deletedAt 非空对象，可按域附加条件如 channel）。
   * clearArchivable：目标模型是否含 archivableAt 列（企业/合作企业档案不参与自动归档，无该列）。 */
  private softOps(
    model: SoftModel,
    extraWhere: Record<string, unknown> = {},
    clearArchivable = true,
  ): Pick<DomainOps, 'restore' | 'purge'> {
    const deletedWhere = { deletedAt: { not: null }, ...extraWhere }
    return {
      restore: async (id: string) => {
        const found = await model.findFirst({ where: { id, ...deletedWhere } })
        if (!found) throw new NotFoundException('归档中不存在该对象')
        /* 同时清空 archivableAt：否则下一轮自动归档会按旧时间再次写入 deletedAt，人工恢复实际失效 */
        await model.update({
          where: { id },
          data: clearArchivable
            ? { deletedAt: null, deletedBy: null, archivableAt: null }
            : { deletedAt: null, deletedBy: null },
        })
      },
      purge: async (id: string) => {
        const found = await model.findFirst({ where: { id, ...deletedWhere } })
        if (!found) throw new NotFoundException('归档中不存在该对象')
        await model.delete({ where: { id } })
      },
    }
  }

  private domainMap(): Record<string, DomainOps> {
    const db = this.prisma
    const deletedWhere = { deletedAt: { not: null } }
    const soft = (m: unknown, extraWhere?: Record<string, unknown>, clearArchivable = true): Pick<DomainOps, 'restore' | 'purge'> =>
      this.softOps(m as SoftModel, extraWhere, clearArchivable)

    return {
      enterprise: {
        label: DOMAIN_DEFS.enterprise.label,
        titleOf: (r) => String(r.name),
        listDeleted: () => db.enterprise.findMany({ where: deletedWhere, orderBy: { deletedAt: 'desc' } }),
        ...soft(db.enterprise, {}, false),
      },
      externalEnterprise: {
        label: DOMAIN_DEFS.externalEnterprise.label,
        titleOf: (r) => String(r.name),
        listDeleted: () =>
          db.externalEnterpriseProfile.findMany({ where: deletedWhere, orderBy: { deletedAt: 'desc' } }),
        ...soft(db.externalEnterpriseProfile, {}, false),
      },
      demand: {
        label: DOMAIN_DEFS.demand.label,
        titleOf: (r) => String(r.title),
        listDeleted: () =>
          db.demand.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: {
              id: true,
              title: true,
              status: true,
              publisherName: true,
              createdAt: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.demand),
      },
      project: {
        label: DOMAIN_DEFS.project.label,
        titleOf: (r) => String(r.name),
        listDeleted: () =>
          db.project.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: { id: true, name: true, code: true, status: true, deletedAt: true, deletedBy: true },
          }),
        ...soft(db.project),
      },
      event: {
        label: DOMAIN_DEFS.event.label,
        titleOf: (r) => String(r.title),
        listDeleted: () =>
          db.communityEvent.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: {
              id: true,
              title: true,
              startTime: true,
              endTime: true,
              status: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.communityEvent),
      },
      article: {
        label: DOMAIN_DEFS.article.label,
        titleOf: (r) => String(r.title),
        listDeleted: () =>
          db.article.findMany({
            where: { ...deletedWhere, channel: 'official' },
            orderBy: { deletedAt: 'desc' },
            select: {
              id: true,
              title: true,
              columnName: true,
              authorName: true,
              status: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.article, { channel: 'official' }),
      },
      submission: {
        label: DOMAIN_DEFS.submission.label,
        titleOf: (r) => String(r.title),
        listDeleted: () =>
          db.article.findMany({
            where: { ...deletedWhere, channel: 'submitted' },
            orderBy: { deletedAt: 'desc' },
            select: { id: true, title: true, authorName: true, status: true, deletedAt: true, deletedBy: true },
          }),
        ...soft(db.article, { channel: 'submitted' }),
      },
      announcement: {
        label: DOMAIN_DEFS.announcement.label,
        titleOf: (r) => String(r.title),
        listDeleted: () =>
          db.announcement.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: { id: true, title: true, status: true, pinned: true, deletedAt: true, deletedBy: true },
          }),
        ...soft(db.announcement),
      },
      lease: {
        label: DOMAIN_DEFS.lease.label,
        titleOf: (r) => String(r.renterName),
        listDeleted: () =>
          db.lease.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: {
              id: true,
              renterName: true,
              startDate: true,
              endDate: true,
              status: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.lease),
      },
      reservation: {
        label: DOMAIN_DEFS.reservation.label,
        titleOf: (r) => String(r.userName),
        listDeleted: () =>
          db.spaceReservation.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: {
              id: true,
              userName: true,
              spaceName: true,
              date: true,
              startTime: true,
              endTime: true,
              status: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.spaceReservation),
      },
      goods: {
        label: DOMAIN_DEFS.goods.label,
        titleOf: (r) => String(r.name),
        listDeleted: () =>
          db.mallGoods.findMany({
            where: deletedWhere,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              category: true,
              points: true,
              stock: true,
              redeemedCount: true,
              status: true,
              createdAt: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.mallGoods),
      },
      order: {
        label: DOMAIN_DEFS.order.label,
        titleOf: (r) => `${String(r.id)} · ${String(r.goodsName)}`,
        listDeleted: () =>
          db.redemptionOrder.findMany({
            where: deletedWhere,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              userId: true,
              userName: true,
              goodsId: true,
              goodsName: true,
              points: true,
              status: true,
              createdAt: true,
              finishedAt: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.redemptionOrder),
      },
      application: {
        label: DOMAIN_DEFS.application.label,
        titleOf: (r) => `${String(r.applicantName)} · ${String(r.targetName)}`,
        listDeleted: () =>
          db.application.findMany({
            where: deletedWhere,
            orderBy: { deletedAt: 'desc' },
            select: {
              id: true,
              type: true,
              applicantName: true,
              targetName: true,
              status: true,
              submittedAt: true,
              deletedAt: true,
              deletedBy: true,
            },
          }),
        ...soft(db.application),
      },
    }
  }
}
