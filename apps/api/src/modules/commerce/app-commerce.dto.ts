import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PageQueryDto } from '../../common/dto/page-query.dto'

export const APP_SOURCE_TYPES = ['mall', 'space', 'event', 'lease_bill'] as const
export type AppSourceType = (typeof APP_SOURCE_TYPES)[number]
export const APP_PAY_METHODS = ['jsapi', 'h5', 'native'] as const

/** 报价输入：金额、折扣与主体权限全部由后端计算/校验，客户端不提交可结算金额。 */
export class CreateQuoteDto {
  @IsIn(APP_SOURCE_TYPES) sourceType!: AppSourceType
  @IsString() @MinLength(1) @MaxLength(32) sourceId!: string

  /* 空间预约参数（sourceType=space） */
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '预约日期格式应为 YYYY-MM-DD' }) date?: string
  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/, { message: '开始时间格式应为 HH:mm' }) start?: string
  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/, { message: '结束时间格式应为 HH:mm' }) end?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) attendees?: number
  @IsOptional() @IsString() @MaxLength(255) topic?: string

  /* 购买/预约主体 */
  @IsOptional() @IsString() @MaxLength(24) asIdentity?: string
  @IsOptional() @IsString() @MaxLength(16) asEnterpriseId?: string

  /* 活动报名留言 */
  @IsOptional() @IsString() @MaxLength(200) message?: string
}

export class CreateOrderDto {
  @IsString() @MinLength(1) @MaxLength(32) quoteId!: string
}

export class PayOrderDto {
  @IsOptional() @IsIn(APP_PAY_METHODS) method?: (typeof APP_PAY_METHODS)[number]
}

export class RefundRequestDto {
  @IsString() @MinLength(2) @MaxLength(80) reason!: string
}

export class TransactionQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['all', 'unpaid', 'active', 'refund', 'closed']) status?: string
  @IsOptional() @IsIn(APP_SOURCE_TYPES) sourceType?: string
}

export class BillQueryDto extends PageQueryDto {}
