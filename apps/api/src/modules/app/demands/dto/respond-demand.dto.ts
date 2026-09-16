import { IsIn, IsOptional, IsString } from 'class-validator'

/* POST /api/app/demands/:id/respond 入参 */
export class RespondDemandDto {
  /** 响应留言（对应 DemandRespondent.message） */
  @IsString()
  note!: string

  /** 报价（选填） */
  @IsOptional()
  @IsString()
  quote?: string

  /** 以社区企业身份响应时的企业 id（成员需持 respond_demand 权限） */
  @IsOptional()
  @IsString()
  asEnterpriseId?: string

  /** 以企业身份响应时的企业名（请求方主体快照；不传则由服务端解析） */
  @IsOptional()
  @IsIn(['individual', 'community_individual', 'community_enterprise', 'external_enterprise'])
  asIdentity?: string
}