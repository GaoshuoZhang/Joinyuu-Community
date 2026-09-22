import { Injectable } from '@nestjs/common'
import type { AuditLog, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AUDIT_SNAPSHOT_MAX_CHARS } from '../../common/audit/audit.service'
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto'

/* 操作日志查询（wiki-backend.md §7.15/§9.1）：module 精确筛选 + keyword 跨 target/action/detail/operator
 * 模糊匹配，最新在前。写入由各域 service 调 AuditService.record（IP 经 AuditContextMiddleware
 * 写入的请求上下文落库），本服务只读。 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAuditLogsDto): Promise<{ list: Record<string, unknown>[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {}
    if (query.module) where.module = query.module

    const kw = query.keyword?.trim()
    if (kw) {
      where.OR = [
        { target: { contains: kw, mode: 'insensitive' } },
        { action: { contains: kw, mode: 'insensitive' } },
        { detail: { contains: kw, mode: 'insensitive' } },
        { operator: { contains: kw, mode: 'insensitive' } },
      ]
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ])
    return { list: rows.map(toAuditLogDto), total }
  }
}

/* apps/admin/src/types/index.ts AuditLog 形状：id/operator/module/action/target/at + 可选
 * detail/ip/before/after/snapshotTruncated。
 * 体量保护：单条快照序列化超过 AUDIT_SNAPSHOT_MAX_CHARS 时截断为字符串预览并置 snapshotTruncated，
 * 避免整页（最多 100 条 × 2 字段）大 JSON 撑爆列表响应；未新增详情接口，截断即为取舍。 */
function toAuditLogDto(l: AuditLog): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    id: l.id,
    operator: l.operator,
    module: l.module,
    action: l.action,
    target: l.target,
    at: l.at,
  }
  if (l.detail != null) dto.detail = l.detail
  if (l.ip != null) dto.ip = l.ip

  const before = clipSnapshot(l.before)
  const after = clipSnapshot(l.after)
  if (before.value !== undefined) dto.before = before.value
  if (after.value !== undefined) dto.after = after.value
  if (before.truncated || after.truncated) dto.snapshotTruncated = true
  return dto
}

/** 快照体量保护：未超限原样返回结构化 JSON；超限截断为字符串（前端按纯文本展示，并提示已截断） */
function clipSnapshot(value: Prisma.JsonValue | null): { value?: unknown; truncated: boolean } {
  if (value == null) return { value: undefined, truncated: false }
  const text = JSON.stringify(value)
  if (text.length <= AUDIT_SNAPSHOT_MAX_CHARS) return { value, truncated: false }
  return { value: `${text.slice(0, AUDIT_SNAPSHOT_MAX_CHARS)}…`, truncated: true }
}
