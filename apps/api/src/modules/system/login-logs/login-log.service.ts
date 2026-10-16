import { Injectable } from '@nestjs/common'
import type { LoginLog, Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { formatNowSec } from '../../../common/utils/time'
import { parseRegion } from '../../../common/utils/device'
import type { QueryLoginLogsDto } from './dto/query-login-logs.dto'

export interface LoginLogInput {
  username: string
  ip?: string
  device?: string
  status: 'success' | 'fail' | 'locked'
  failReason?: string
}

export interface LoginLogDto {
  id: string
  username: string
  name: string
  ip: string
  region: string
  device: string
  status: 'success' | 'failed' | 'locked'
  failedReason?: string
  createdAt: string
}

/* 登录日志：登录成功/失败/锁定写入；查询支持状态/关键词/时间范围筛选。
 * 展示名 name 由 AdminUser 关联解析（username 为账号）。 */
@Injectable()
export class LoginLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  /** 写入一条登录日志（失败仅告警，不影响登录主流程） */
  async record(input: LoginLogInput): Promise<void> {
    try {
      await this.prisma.loginLog.create({
        data: {
          id: await this.ids.next('LL'),
          loginAt: formatNowSec(),
          username: input.username,
          ip: input.ip ?? '',
          device: input.device ?? '',
          status: input.status,
          failReason: input.failReason ?? null,
        },
      })
    } catch (e) {
      console.error('[login-log] 写入失败:', e instanceof Error ? e.message : e)
    }
  }

  async list(query: QueryLoginLogsDto): Promise<{ list: LoginLogDto[]; total: number }> {
    const conditions: Prisma.LoginLogWhereInput[] = []
    if (query.status?.length) {
      /* 勾选式多值状态：展示枚举 failed 落库为 'fail'，多选归一去重后按 in 过滤 */
      const mapped = [
        ...new Set(query.status.map((s) => (s === 'success' ? 'success' : s === 'locked' ? 'locked' : 'fail'))),
      ]
      conditions.push({ status: { in: mapped } })
    }
    if (query.keyword) {
      const kw = query.keyword.trim()
      conditions.push({ OR: [{ username: { contains: kw } }, { ip: { contains: kw } }] })
    }
    if (query.startDate) conditions.push({ loginAt: { gte: query.startDate } })
    if (query.endDate) conditions.push({ loginAt: { lte: `${query.endDate} 23:59:59` } })
    const where: Prisma.LoginLogWhereInput = conditions.length ? { AND: conditions } : {}

    const [total, rows] = await Promise.all([
      this.prisma.loginLog.count({ where }),
      this.prisma.loginLog.findMany({
        where,
        orderBy: [{ loginAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    const usernames = [...new Set(rows.map((r) => r.username))]
    const admins = await this.prisma.adminUser.findMany({
      where: { username: { in: usernames } },
      select: { username: true, name: true },
    })
    const nameMap = new Map(admins.map((a) => [a.username, a.name]))

    return { list: rows.map((r) => toLoginLogDto(r, nameMap.get(r.username) ?? r.username)), total }
  }
}

function toLoginLogDto(r: LoginLog, name: string): LoginLogDto {
  const dto: LoginLogDto = {
    id: r.id,
    username: r.username,
    name,
    ip: r.ip,
    region: parseRegion(r.ip),
    device: r.device,
    status: r.status === 'success' ? 'success' : r.status === 'locked' ? 'locked' : 'failed',
    createdAt: r.loginAt,
  }
  if (r.failReason != null) dto.failedReason = r.failReason
  return dto
}
