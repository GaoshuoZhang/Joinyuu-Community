import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* POST /api/admin/demands 入参（DemandCreatePayload）
 * 后台自建需求：提交人/提交人身份一律由服务端按当前登录工作人员派生（账号名 + 姓名 + 角色名），
 * 不接受客户端传入，故本 DTO 不再包含 publisher* 字段 */
export class CreateDemandDto {
  @IsString()
  title!: string

  @IsString()
  category!: string

  @IsOptional()
  @IsIn(['task', 'investment', 'cooperation'])
  demandType?: 'task' | 'investment' | 'cooperation'

  @IsOptional()
  @IsString()
  deliverable?: string

  @IsOptional()
  @IsString()
  deliverBy?: string

  @IsOptional()
  @IsString()
  cooperationNeed?: string

  @IsOptional()
  @IsString()
  returnOffer?: string

  @IsOptional()
  @IsString()
  bottleneck?: string

  @IsOptional()
  @IsString()
  partnershipMode?: string

  @IsString()
  budget!: string

  @IsString()
  period!: string

  @IsString()
  deadline!: string

  @IsString()
  description!: string

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

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsString()
  contactEmail?: string

  /** 公开联系人：开启后客户端（含未登录游客）可见联系人姓名/电话/邮箱；默认关闭 */
  @IsOptional()
  @IsBoolean()
  contactPublic?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  respondPoints?: number

  @IsOptional()
  @IsString()
  scheduledAt?: string
}
