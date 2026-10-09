import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* PUT /api/admin/demands/:id 入参（DemandPublishPayload，编辑不改状态/提交人） */
export class UpdateDemandDto {
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

  /** 响应需审核：开启后客户端提交的响应先进入待审核，管理员审核通过才对发布者可见；默认开启 */
  @IsOptional()
  @IsBoolean()
  respondNeedReview?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  respondPoints?: number
}
