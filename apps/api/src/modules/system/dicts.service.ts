import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { DictEntry } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_TTL, dictCacheKey } from '../../common/redis/cache-keys'
import type { DictEntryPayloadDto } from './dto/dict-entry-payload.dto'

/* 数据字典（wiki-backend.md §7.15/§10）：站点选项词汇的单一来源。
 * label 即业务存储值（全类型唯一，不可改名）；新增/启停/删除；删除后重排 sort 保持连续。
 * 管理页返回全量（含 disabled），下拉消费方自行按 status=enabled 过滤（M0 口径）。
 * 读走 dicts:{type} 缓存（10min），写操作主动失效并留痕（含 before/after 快照）。 */
export const DICT_TYPE_LABELS: Record<string, string> = {
  demand_category: '需求类别',
  industry: '行业',
  event_type: '活动类型',
}

const DICT_TYPE_PREFIXES: Record<string, string> = {
  demand_category: 'DC',
  industry: 'IN',
  event_type: 'ET',
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
      this.prisma.dictEntry.findMany({ where: { type }, orderBy: { sort: 'asc' } }),
    )
  }

  async create(type: string, payload: DictEntryPayloadDto, operator: string): Promise<DictEntry> {
    this.assertType(type)
    const label = (payload.label ?? '').trim()
    if (!label) throw new BadRequestException('请输入字典项名称')

    /* label 全类型唯一（DB @@unique([label])，跨字典类型去重） */
    const dup = await this.prisma.dictEntry.findUnique({ where: { label } })
    if (dup) throw new ConflictException('字典项名称已存在')

    const list = await this.prisma.dictEntry.findMany({ where: { type }, orderBy: { sort: 'asc' } })
    const maxNum = list.reduce((m, e) => Math.max(m, Number(e.code.replace(/\D/g, '')) || 0), 0)
    const code = `${DICT_TYPE_PREFIXES[type]}${String(maxNum + 1).padStart(3, '0')}`

    const entry = await this.prisma.dictEntry.create({
      data: { type, code, label, sort: list.length + 1, status: 'enabled' },
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

  async remove(type: string, code: string, operator: string): Promise<{ code: number }> {
    this.assertType(type)
    const entry = await this.prisma.dictEntry.findUnique({ where: { type_code: { type, code } } })
    if (!entry) throw new NotFoundException('字典项不存在')

    /* 删除 + 同类型剩余项 sort 重排（保持 1..n 连续，M0 口径） */
    await this.prisma.$transaction(async (tx) => {
      await tx.dictEntry.delete({ where: { type_code: { type, code } } })
      const rest = await tx.dictEntry.findMany({ where: { type }, orderBy: { sort: 'asc' } })
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].sort !== i + 1) {
          await tx.dictEntry.update({
            where: { type_code: { type, code: rest[i].code } },
            data: { sort: i + 1 },
          })
        }
      }
    })

    await this.audit.record({
      module: '系统管理',
      action: '删除字典项',
      target: `${DICT_TYPE_LABELS[type]} · ${entry.label}`,
      before: { code: entry.code, label: entry.label, status: entry.status },
      operator,
    })

    await this.redis.delCache(dictCacheKey(type))
    return { code: 0 }
  }

  private assertType(type: string): void {
    if (!DICT_TYPE_LABELS[type]) throw new BadRequestException('字典类型不存在')
  }
}
