import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'

export const COMMERCE_MODULES = ['demand', 'project', 'lease', 'space', 'event', 'mall'] as const
export const MAX_FEN = 100_000_000

export class CommerceQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10
  @IsOptional() @IsString() @MaxLength(128) keyword?: string
  @IsOptional() @IsIn(COMMERCE_MODULES) module?: string
  @IsOptional() @IsString() @MaxLength(16) sourceId?: string
  @IsOptional() @IsIn(['unpaid', 'paid', 'void', 'refunded', 'overdue']) status?: string
}

export class CreateCommerceBillDto {
  @IsIn(COMMERCE_MODULES) module!: string
  @IsString() @MinLength(1) @MaxLength(16) sourceId!: string
  @IsIn(['user', 'enterprise']) buyerType!: string
  @IsString() @MinLength(1) @MaxLength(16) buyerId!: string
  @IsString() @MinLength(1) @MaxLength(128) title!: string
  @IsString() @MinLength(1) @MaxLength(64) period!: string
  @IsInt() @Min(1) @Max(MAX_FEN) amountFen!: number
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string
  @IsString() @MinLength(1) @MaxLength(2000) agreement!: string
  @IsOptional() @IsInt() @Min(1) @Max(10000) quantity = 1
}

export class RegisterReceiptDto {
  @IsString() @MinLength(1) @MaxLength(128) reference!: string
  @IsString() @MinLength(1) @MaxLength(500) note!: string
}

export class ReviewReceiptDto {
  @IsIn(['approved', 'rejected']) status!: 'approved' | 'rejected'
}

export class RefundCommerceDto {
  @IsInt() @Min(1) @Max(MAX_FEN) amountFen!: number
  @IsString() @MinLength(1) @MaxLength(80) reason!: string
}
