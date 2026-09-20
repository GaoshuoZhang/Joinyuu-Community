import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { CHANNEL_KINDS } from '../messaging.types'

const OUTBOX_STATUSES = ['pending', 'sending', 'sent', 'failed', 'dead', 'skipped'] as const

/* GET /api/admin/outbox 查询：分页 + 状态/渠道/关键字筛选 */
export class QueryOutboxDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  @IsIn(OUTBOX_STATUSES, { message: '状态不合法' })
  status?: string

  @IsOptional()
  @IsIn(CHANNEL_KINDS, { message: '消息类型不合法' })
  channelKind?: string

  /** 跨收件人 / 模板编码 / 幂等键 / 用户 模糊匹配 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string
}
