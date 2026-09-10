import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/* 前缀字符串 ID 发号器（wiki-backend.md §5.1）：
 * 前缀 = 'U'/'E'/'D'/'AL'...，IdSequence 表单行原子自增，禁止 MAX(id) 取号（并发不安全） */
@Injectable()
export class IdGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /** 取下一号，如 next('AL') → 'AL1002' */
  async next(prefix: string): Promise<string> {
    const number = await this.nextNumber(prefix)
    return `${prefix}${number}`
  }

  /** 取纯序号（不拼前缀），供需要自定义格式化（如 JY-2026-01）的编号使用 */
  async nextNumber(prefix: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ nextNumber: number }>>`
      INSERT INTO "IdSequence" ("entityType", "nextNumber")
      VALUES (${prefix}, 1)
      ON CONFLICT ("entityType") DO UPDATE SET "nextNumber" = "IdSequence"."nextNumber" + 1
      RETURNING "nextNumber"`
    return rows[0].nextNumber
  }
}
