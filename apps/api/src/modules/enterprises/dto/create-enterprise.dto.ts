import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator'

/* 社区企业新增载荷（对照 apps/admin Enterprise 字段；管理员手动新增企业，新增即正常态）
 * 社区企业必须关联一个个人用户（contactUserId），联系人姓名/联系电话/邮箱由服务端按用户解析填充 */
export class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  industry!: string

  @IsString()
  @IsNotEmpty()
  size!: string

  @IsString()
  @IsNotEmpty()
  leaseType!: string

  /** 关联用户 UID（必填，仅个人用户；联系人信息由该用户派生） */
  @IsString()
  @IsNotEmpty()
  contactUserId!: string

  /** 联系人职位（展示于成员管理，选填） */
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
  settledAt?: string

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