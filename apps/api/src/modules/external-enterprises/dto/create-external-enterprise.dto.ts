import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

/* 合作企业新增载荷（名称/行业必填；规模/成立时间/简介可选；合作数据默认 0） */
export class CreateExternalEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  industry!: string

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