import { IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

/* POST /api/app/demands 与 POST /me/demands/:id/resubmit 共用入参
 * 领域字段口径对齐 docs/api-app-design.md §6 与客户端 DemandCreatePayload（只读对齐）。 */
export class CreateDemandDto {
  @IsIn(['task', 'investment', 'cooperation'])
  kind!: 'task' | 'investment' | 'cooperation'

  @IsString()
  title!: string

  @IsString()
  description!: string

  /** 类目字典：task/cooperation → demand_category；investment → industry */
  @IsIn(['demand_category', 'industry'])
  categoryDict!: 'demand_category' | 'industry'

  @IsString()
  categoryCode!: string

  /** 发布身份（个人用户/社区个体/社区企业/合作企业）；缺省按持有身份推导 */
  @IsOptional()
  @IsIn(['individual', 'community_individual', 'community_enterprise', 'external_enterprise'])
  asIdentity?: string

  /** 成员代社区企业发布时的企业 id */
  @IsOptional()
  @IsString()
  asEnterpriseId?: string

  @IsString()
  contactName!: string

  @IsString()
  contactPhone!: string

  @IsOptional()
  @IsEmail()
  contactEmail?: string

  /** task 专属：预期交付内容 */
  @IsOptional()
  @IsString()
  deliverable?: string

  /** task 专属：预期交付日期（YYYY-MM-DD） */
  @IsOptional()
  @IsString()
  deliverBy?: string

  /** task 专属：预算范围（历史字段，字符串） */
  @IsOptional()
  @IsString()
  budget?: string

  /** investment 专属：希望获得的投资 / 合作 */
  @IsOptional()
  @IsString()
  cooperationNeed?: string

  /** cooperation 专属：业务瓶颈与合作诉求 */
  @IsOptional()
  @IsString()
  bottleneck?: string

  /** cooperation 专属：期望合作方式 */
  @IsOptional()
  @IsString()
  partnershipMode?: string

  /** investment / cooperation 可提供给对方的回报与资源 */
  @IsOptional()
  @IsString()
  returnOffer?: string

  /** 可见范围（身份类型；空数组 = 不限） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibilityIdentities?: string[]

  /** 可见范围（等级；空数组 = 不限） */
  @IsArray()
  @IsNumber({}, { each: true })
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  @IsOptional()
  visibilityLevels?: number[]
}