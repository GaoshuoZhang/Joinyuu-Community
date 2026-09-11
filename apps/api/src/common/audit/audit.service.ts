import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { IdGeneratorService } from '../id-generator/id-generator.service'
import { formatNow } from '../utils/time'

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
    const id = await this.ids.next('AL')
    await this.prisma.auditLog.create({
      data: {
        id,
        operator: input.operator ?? '系统',
        module: input.module,
        action: input.action,
        target: input.target,
        detail: input.detail,
        at: formatNow(),
        ip: input.ip,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
      },
    })
  }
}
