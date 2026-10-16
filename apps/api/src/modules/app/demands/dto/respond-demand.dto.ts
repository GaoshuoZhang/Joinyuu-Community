import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/* POST /api/app/demands/:id/respond 入参 */
export class RespondDemandDto {
  /** 响应说明（对应 DemandRespondent.message） */
  @IsString()
  @MaxLength(500)
  note!: string

  /** 报价/预算（选填） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  quote?: string

  /** 可投入时间/预计工期（选填，如「2 周内可开工」） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  timeline?: string

  /** 相关经验与案例（选填） */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cases?: string

  /** 联系手机（选填）：留空沿用身份里的手机号，填写则覆盖并记录在该条响应上 */
  @IsOptional()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string

  /** 联系邮箱（选填）：留空沿用账号邮箱，填写则覆盖并记录在该条响应上 */
  @IsOptional()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不正确' })
  email?: string

  /** 以社区企业身份响应时的企业 id（成员需持 respond_demand 权限） */
  @IsOptional()
  @IsString()
  asEnterpriseId?: string

  /** 以企业身份响应时的企业名（请求方主体快照；不传则由服务端解析） */
  @IsOptional()
  @IsIn(['individual', 'community_individual', 'community_enterprise', 'external_enterprise'])
  asIdentity?: string
}