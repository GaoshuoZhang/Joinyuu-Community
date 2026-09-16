import { IsNumber, IsOptional, IsString } from 'class-validator'

/** 空间预约提交入参：
 * - 时段：兼容客户端 start/end 与底账字段 startTime/endTime 两套命名
 * - 用途：兼容客户端 topic 与底账 purpose 两套命名
 * - 主体：identityType/subjectName 快照 + 代企业 asEnterpriseId（校验 space_reserve） */
export class CreateReservationDto {
  @IsString()
  spaceId!: string

  @IsString()
  date!: string

  @IsOptional()
  @IsString()
  start?: string

  @IsOptional()
  @IsString()
  end?: string

  @IsOptional()
  @IsString()
  startTime?: string

  @IsOptional()
  @IsString()
  endTime?: string

  @IsOptional()
  @IsString()
  topic?: string

  @IsOptional()
  @IsString()
  purpose?: string

  @IsOptional()
  @IsNumber()
  attendees?: number

  @IsOptional()
  @IsString()
  identityType?: string

  @IsOptional()
  @IsString()
  subjectName?: string

  @IsOptional()
  @IsString()
  asIdentity?: string

  @IsOptional()
  @IsString()
  asEnterpriseId?: string
}