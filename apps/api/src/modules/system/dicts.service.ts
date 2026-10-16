import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type DictEntry } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_TTL, dictCacheKey } from '../../common/redis/cache-keys'
import type { DictEntryPayloadDto, UpdateDictEntryDto } from './dto/dict-entry-payload.dto'

/* 数据字典（wiki-backend.md §7.15/§10）：站点选项词汇的单一来源。
 * label 即业务存储值（全类型唯一，不可改名；商品类型例外，业务存 code、展示靠 label）；
 * 新增/编辑/启停/删除；编码取「最小未占用序号」不跳号，sort 恒为 1..n 连续（新增/删除后重排）。
 * 商品类别（goods_category）另有类别级可见/可下单范围（见 scopeData），在「商品管理 > 商品类别」弹窗维护。
 * 管理页返回全量（含 disabled），下拉消费方自行按 status=enabled 过滤。
 * 读走 dicts:{type} 缓存（10min），写操作主动失效并留痕（含 before/after 快照）。 */
export const DICT_TYPE_LABELS: Record<string, string> = {
  demand_category: '需求类别',
  industry: '行业',
  event_type: '活动类型',
  goods_category: '商品类型',
}

const DICT_TYPE_PREFIXES: Record<string, string> = {
  demand_category: 'DC',
  industry: 'IN',
  event_type: 'ET',
  goods_category: 'GC',
}

/* ---------- 字典项维护 ---------- */

/** 商品类别范围字段 → 待写入值：仅提交的字段参与更新（trim 去空项；空数组 = 不限） */
function scopeValues(payload: DictEntryPayloadDto | UpdateDictEntryDto): {
  visibilityIdentities?: string[]
  visibilityLevels?: string[]
  orderIdentities?: string[]
  orderLevels?: string[]
} {
  const clean = (value?: string[]) => value === undefined ? undefined : value.map((item) => item.trim()).filter(Boolean)
  const data: ReturnType<typeof scopeValues> = {}
  const visibilityIdentities = clean(payload.visibilityIdentities)
  const visibilityLevels = clean(payload.visibilityLevels)
  const orderIdentities = clean(payload.orderIdentities)
  const orderLevels = clean(payload.orderLevels)
  if (visibilityIdentities) data.visibilityIdentities = visibilityIdentities
  if (visibilityLevels) data.visibilityLevels = visibilityLevels
  if (orderIdentities) data.orderIdentities = orderIdentities
  if (orderLevels) data.orderLevels = orderLevels
  return data
}

@Injectable()
export class DictsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async findAll(type: string): Promise<DictEntry[]> {
    this.assertType(type)
    return this.redis.remember(dictCacheKey(type), CACHE_TTL.stable, () =>
      /* sort 并列（历史数据可能有重复值）时以 code 兜底，保证列表顺序稳定 */
      this.prisma.dictEntry.findMany({ where: { type }, orderBy: [{ sort: 'asc' }, { code: 'asc' }] }),
    )
  }

  async create(type: string, payload: DictEntryPayloadDto, operator: string): Promise<DictEntry> {
    this.assertType(type)
    const label = (payload.label ?? '').trim()
    if (!label) throw new BadRequestException('请输入字典项名称')

    /* label 全类型唯一（DB @@unique([label])，跨字典类型去重） */
    const dup = await this.prisma.dictEntry.findUnique({ where: { label } })
    if (dup) throw new ConflictException('字典项名称已存在')

    const entry = await this.prisma
      .$transaction(async (tx) => {
        const list = await tx.dictEntry.findMany({ where: { type }, select: { code: true, sort: true } })
        const code = `${DICT_TYPE_PREFIXES[type]}${String(nextCodeSeq(list)).padStart(3, '0')}`
        const created = await tx.dictEntry.create({
          data: {
            type,
            code,
            label,
            sort: list.reduce((max, item) => Math.max(max, item.sort), 0) + 1,
            status: 'enabled',
            ...scopeValues(payload),
          },
        })
        /* 历史新增逻辑按「条目数 +1」写 sort，会留下重复/跳号；新增后统一重排为 1..n */
        await normalizeSort(tx, type)
        return (await tx.dictEntry.findUnique({ where: { type_code: { type, code } } })) ?? created
      })
      .catch((e: unknown) => {
        /* 并发新增时按「最小未占用序号」拼码仍可能撞 type_code 唯一约束：转 409 供前端重试，
         * 而不是把 Prisma 校验错误透传成 500 */
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('字典编码冲突，请重试')
        }
        throw e
      })

    await this.audit.record({
      module: '系统管理',
      action: '新增字典项',
      target: `${DICT_TYPE_LABELS[type]} · ${label}`,
      after: { code: entry.code, label: entry.label, sort: entry.sort, status: entry.status },
      operator,
    })

    await this.redis.delCache(dictCacheKey(type))
    return entry
  }

  /** 编辑字典项：名称与商品类别范围均可选提交（未提交字段保持原值） */
  async update(type: string, code: string, payload: UpdateDictEntryDto, operator: string): Promise<DictEntry> {
    this.assertType(type)
    const entry = await this.prisma.dictEntry.findUnique({ where: { type_code: { type, code } } })
    if (!entry) throw new NotFoundException('字典项不存在')

    const label = payload.label === undefined ? undefined : payload.label.trim()
    if (label !== undefined && !label) throw new BadRequestException('请输入字典项名称')
    if (label && label !== entry.label) {
      const dup = await this.prisma.dictEntry.findUnique({ where: { label } })
      if (dup) throw new ConflictException('字典项名称已存在')
    }

    const updated = await this.prisma.dictEntry.update({
      where: { type_code: { type, code } },
      data: { ...(label ? { label } : {}), ...scopeValues(payload) },
    })

    await this.audit.record({
      module: '系统管理',
      action: '编辑字典项',
      target: `${DICT_TYPE_LABELS[type]} · ${updated.label}`,
      before: {
        label: entry.label,
        visibilityIdentities: entry.visibilityIdentities,
        visibilityLevels: entry.visibilityLevels,
        orderIdentities: entry.orderIdentities,
        orderLevels: entry.orderLevels,
      },
      after: {
        label: updated.label,
        visibilityIdentities: updated.visibilityIdentities,
        visibilityLevels: updated.visibilityLevels,
        orderIdentities: updated.orderIdentities,
        orderLevels: updated.orderLevels,
      },
      operator,
    })

    await this.redis.delCache(dictCacheKey(type))
    return updated
  }

  async toggle(type: string, code: string, operator: string): Promise<{ code: number }> {
    this.assertType(type)
    const entry = await this.prisma.dictEntry.findUnique({ where: { type_code: { type, code } } })
    if (!entry) throw new NotFoundException('字典项不存在')

    const status = entry.status === 'enabled' ? 'disabled' : 'enabled'
    await this.prisma.dictEntry.update({ where: { type_code: { type, code } }, data: { status } })

    await this.audit.record({
      module: '系统管理',
      action: status === 'enabled' ? '启用字典项' : '停用字典项',
      target: `${DICT_TYPE_LABELS[type]} · ${entry.label}`,
      before: { status: entry.status },
      after: { status },
      operator,
    })

    await this.redis.delCache(dictCacheKey(type))
    return { code: 0 }
  }

  async remove(type: string, code: string, operator: string, replacementCode?: string): Promise<{ code: number }> {
    this.assertType(type)
    const entry = await this.prisma.dictEntry.findUnique({ where: { type_code: { type, code } } })
    if (!entry) throw new NotFoundException('字典项不存在')

    /* 商品类别：仍被未删除商品引用时必须指定新的启用类别，并在同一事务内把商品迁移过去，
     * 避免出现「商品引用了已删除的类别编码」的脏数据 */
    let target: DictEntry | null = null
    if (type === 'goods_category') {
      const referenced = await this.prisma.mallGoods.count({ where: { category: code, deletedAt: null } })
      if (referenced > 0) {
        if (!replacementCode) throw new BadRequestException(`该类别下仍有 ${referenced} 件商品，请先指定新的商品类别`)
        if (replacementCode === code) throw new BadRequestException('新商品类别不能与被删除的类别相同')
        target = await this.prisma.dictEntry.findUnique({ where: { type_code: { type, code: replacementCode } } })
        if (!target) throw new NotFoundException('目标商品类别不存在')
        if (target.status !== 'enabled') throw new BadRequestException('目标商品类别已停用，请选择启用的类别')
      }
    }

    const replaceCode = target?.code
    /* 迁移商品 + 删除条目 + 同类型剩余项 sort 重排（保持 1..n 连续） */
    const movedGoods = await this.prisma.$transaction(async (tx) => {
      let moved = 0
      if (replaceCode) {
        /* 含软删商品一并迁移，避免残留指向已删类别的编码 */
        const result = await tx.mallGoods.updateMany({ where: { category: code }, data: { category: replaceCode } })
        moved = result.count
      }
      await tx.dictEntry.delete({ where: { type_code: { type, code } } })
      await normalizeSort(tx, type)
      return moved
    })

    await this.audit.record({
      module: '系统管理',
      action: '删除字典项',
      target: `${DICT_TYPE_LABELS[type]} · ${entry.label}`,
      before: { code: entry.code, label: entry.label, status: entry.status, movedGoods },
      after: replaceCode ? { movedGoods, replacementCode: replaceCode, replacementLabel: target?.label } : { movedGoods },
      operator,
    })

    await this.redis.delCache(dictCacheKey(type))
    return { code: 0 }
  }

  private assertType(type: string): void {
    if (!DICT_TYPE_LABELS[type]) throw new BadRequestException('字典类型不存在')
  }
}

/** 最小未占用序号：在既有编码的数字集合里取最小空缺（GC001/GC003 → 2），
 * 避免「最大序号 +1」只增不减导致跳号（如 GC002）永远无法被补上 */
function nextCodeSeq(list: { code: string }[]): number {
  const used = new Set(list.map((item) => Number(item.code.replace(/\D/g, '')) || 0))
  let seq = 1
  while (used.has(seq)) seq += 1
  return seq
}

/** 同类型 sort 重排为 1..n：按 sort asc、code asc 保持既有展示顺序，同时修掉历史重复值 */
async function normalizeSort(tx: Prisma.TransactionClient, type: string): Promise<void> {
  const list = await tx.dictEntry.findMany({
    where: { type },
    orderBy: [{ sort: 'asc' }, { code: 'asc' }],
    select: { code: true, sort: true },
  })
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].sort !== i + 1) {
      await tx.dictEntry.update({
        where: { type_code: { type, code: list[i].code } },
        data: { sort: i + 1 },
      })
    }
  }
}
