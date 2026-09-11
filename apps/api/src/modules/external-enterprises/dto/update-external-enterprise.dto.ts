import { IsOptional, IsString } from 'class-validator'

/* 合作企业编辑载荷（企业名称、行业、规模、成立时间、简介等基本信息） */
export class UpdateExternalEnterpriseDto {
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
  foundedAt?: string

  @IsOptional()
  @IsString()
  description?: string
}