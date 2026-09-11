import { IsArray, IsOptional, IsString } from 'class-validator'

/* 社区企业编辑载荷（可编辑项：企业名称、联系人、联系电话、行业、规模、入驻类型、成立时间等） */
export class UpdateEnterpriseDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  industry?: string

  @IsOptional()
  @IsString()
  size?: string

  @IsOptional()
  @IsString()
  leaseType?: string

  /** 更换关联用户（提供时服务端按其解析联系人姓名/联系电话/邮箱） */
  @IsOptional()
  @IsString()
  contactUserId?: string

  /** 联系人职位（展示于成员管理） */
  @IsOptional()
  @IsString()
  contactTitle?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsString()
  foundedAt?: string

  @IsOptional()
  @IsString()
  contactEmail?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]
}