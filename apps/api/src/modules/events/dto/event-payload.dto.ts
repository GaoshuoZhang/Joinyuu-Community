import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

/* 活动创建/编辑载荷（对照 apps/admin/src/api/events.ts EventPayload） */
export class EventPayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  type!: string

  @IsString()
  @IsNotEmpty()
  startTime!: string

  @IsString()
  @IsNotEmpty()
  endTime!: string

  @IsString()
  @IsNotEmpty()
  location!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number

  @IsString()
  speaker!: string

  @IsString()
  host!: string

  @IsString()
  description!: string

  @IsArray()
  @IsString({ each: true })
  tags!: string[]

  @IsArray()
  @IsString({ each: true })
  visibilityIdentities!: string[]

  @IsArray()
  @IsString({ each: true })
  visibilityLevels!: string[]

  @IsArray()
  @IsString({ each: true })
  enrollmentIdentities!: string[]

  @IsArray()
  @IsString({ each: true })
  enrollmentLevels!: string[]

  @IsBoolean()
  requireReview!: boolean

  @IsOptional()
  @IsString()
  enrollmentDeadline?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  enrollPoints?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  checkinPoints?: number
}
