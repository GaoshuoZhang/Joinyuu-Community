import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

/* PUT /api/admin/audit-logs/retention 载荷（「日志与审计」页右上角「日志设置」）。
 * 两项均必填：0 = 永久保存；范围 0-3650，超出由服务层与 class-validator 双重拦截。 */
export class LogRetentionDto {
  @Type(() => Number)
  @IsInt({ message: '操作日志保留期须为 0-3650 的整数' })
  @Min(0, { message: '操作日志保留期须为 0-3650 的整数' })
  @Max(3650, { message: '操作日志保留期须为 0-3650 的整数' })
  auditLogRetentionDays!: number

  @Type(() => Number)
  @IsInt({ message: '登录日志保留期须为 0-3650 的整数' })
  @Min(0, { message: '登录日志保留期须为 0-3650 的整数' })
  @Max(3650, { message: '登录日志保留期须为 0-3650 的整数' })
  loginLogRetentionDays!: number
}
