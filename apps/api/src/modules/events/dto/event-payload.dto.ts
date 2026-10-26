import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

/* 活动新增/编辑载荷（对照 apps/admin/src/api/events.ts EventPayload） */
export class EventPayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string

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

  /* 报名要求绑定手机号 / 邮箱（默认关）：开启后未绑定用户报名时服务端拒绝并引导去绑定 */
  @IsOptional()
  @IsBoolean()
  enrollRequirePhone?: boolean

  @IsOptional()
  @IsBoolean()
  enrollRequireEmail?: boolean

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

  @IsOptional()
  @IsLatitude()
  venueLat?: string

  @IsOptional()
  @IsLongitude()
  venueLng?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  checkinRadiusM?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  checkinOpenMin?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  checkinCloseMin?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cancelDeadlineHours?: number

  /* 签到校验位置开关：开启后客户端签到才做地理围栏校验（默认关） */
  @IsOptional()
  @IsBoolean()
  checkinLocationRequired?: boolean

  /* 签到校验码开关（默认开）：关闭后不再要求输入签到码 */
  @IsOptional()
  @IsBoolean()
  checkinCodeRequired?: boolean

  /* 6 位数字签到码：required=true 且留空时由服务端自动生成；required=false 时服务端置空 */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: '签到码须为 6 位数字' })
  checkinCode?: string
}
