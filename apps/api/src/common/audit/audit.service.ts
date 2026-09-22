import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { IdGeneratorService } from '../id-generator/id-generator.service'
import { formatNow } from '../utils/time'
import { currentAuditContext } from './audit-context'

/** 审计快照单字段文本上限：列表接口与 CSV 导出共用，超出截断（避免大 JSON 撑爆响应/单元格） */
export const AUDIT_SNAPSHOT_MAX_CHARS = 4096

export interface AuditInput {
  module: string
  action: string
  /** 操作对象（编号 · 名称） */
  target: string
  detail?: string
  /** 操作人（默认取 JWT；系统触发传"系统"） */
  operator?: string
  ip?: string
  /** 变更前后快照 */
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
}

/* 审计服务：写操作留痕（wiki-backend.md §9.1）
 * 各域写操作通过 @Audit 装饰器声明记录审计 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async record(input: AuditInput): Promise<void> {
    /* 缺省值来自请求上下文（中间件写入）：显式传入优先；无请求上下文（定时任务）时 ip 为空、operator 为「系统」 */
    const ctx = currentAuditContext()
    const id = await this.ids.next('AL')
    await this.prisma.auditLog.create({
      data: {
        id,
        operator: input.operator ?? ctx?.request?.user?.name ?? '系统',
        module: input.module,
        action: input.action,
        target: input.target,
        detail: input.detail,
        at: formatNow(),
        ip: input.ip ?? ctx?.ip,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
      },
    })
  }
}
