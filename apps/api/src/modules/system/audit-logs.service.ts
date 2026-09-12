import { Injectable } from '@nestjs/common'
import type { AuditLog, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto'

/* 操作日志查询（wiki-backend.md §7.15/§9.1）：module 精确筛选 + keyword 跨 target/action/detail/operator
 * 模糊匹配，最新在前。写入由各域服务 / AuditInterceptor 完成，本服务只读。 */
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

/* apps/admin/src/types/index.ts AuditLog 形状：不含 ip/before/after（扩展列） */
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
  return dto
}
