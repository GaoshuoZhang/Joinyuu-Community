import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { addDays, formatToday } from '../../common/utils/time'

/* 日志保留期清理（对应「日志与审计」页右上角「日志设置」）：
 * 按 SystemConfig 的保留天数清理超期的操作日志与登录日志，0 = 永久保存（跳过该表）。
 * 由 SchedulerService 的 log-retention-purge 任务（每天 03:00）调用，SchedulerLog 由调度器统一记录；
 * 审计每次运行只写 1 条汇总——严禁逐行写，否则清理动作自身会持续污染审计表。 */
@Injectable()
export class LogRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 返回本次清理的条数（操作日志 + 登录日志） */
  async run(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (!config) return 0

    const auditDays = config.auditLogRetentionDays
    const loginDays = config.loginLogRetentionDays
    let removed = 0

    if (auditDays > 0) {
      /* AuditLog.at 为 YYYY-MM-DD HH:mm：cutoff 取当日 23:59，保证「第 N 天」当天仍保留 */
      const cutoff = `${addDays(formatToday(), -auditDays)} 23:59`
      const result = await this.prisma.auditLog.deleteMany({ where: { at: { lt: cutoff } } })
      removed += result.count
    }
    if (loginDays > 0) {
      const cutoff = `${addDays(formatToday(), -loginDays)} 23:59:59`
      const result = await this.prisma.loginLog.deleteMany({ where: { loginAt: { lt: cutoff } } })
      removed += result.count
    }

    await this.audit.record({
      module: '系统管理',
      action: '日志自动清理',
      target: '日志与审计',
      detail: `操作日志保留 ${retentionText(auditDays)} · 登录日志保留 ${retentionText(loginDays)} · 共清理 ${removed} 条`,
      operator: '系统',
    })
    return removed
  }
}

/** 保留期文案：0（或负）= 永久保存 */
function retentionText(days: number): string {
  return days > 0 ? `${days} 天` : '永久'
}
