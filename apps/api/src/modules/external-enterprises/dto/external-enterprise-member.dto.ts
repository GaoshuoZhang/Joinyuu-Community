import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

/* 合作企业关联成员（新增身份：type=external_enterprise，enterpriseName=档案名） */
export class ExternalEnterpriseMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsOptional()
  @IsString()
  title?: string
}