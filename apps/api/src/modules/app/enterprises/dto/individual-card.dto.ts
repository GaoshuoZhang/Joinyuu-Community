import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class IndividualCardVisibilityDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  age?: boolean

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  politicalStatus?: boolean
}

/** 个人名片分段：教育经历 */
export interface IndividualEducationSegment {
  school: string
  major?: string
  degree?: string
  period?: string
}

/** 个人名片分段：工作经历 */
export interface IndividualWorkSegment {
  company: string
  title?: string
  period?: string
  description?: string
}

/** 个人名片分段：项目经历 */
export interface IndividualProjectSegment {
  name: string
  role?: string
  period?: string
  description?: string
}

/** 个人名片分段：荣誉 */
export interface IndividualHonorSegment {
  name: string
  date?: string
}

/** 个人名片分段：社交账号 / 自定义链接 */
export interface IndividualLinkSegment {
  label: string
  url: string
}

/** 个人名片保存入参（Q8 决：免审保存即公开；age 为字符串入参，服务端解析为整数存储） */
export class UpdateIndividualCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '展示姓名过长' })
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '个人简介过长' })
  intro?: string

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '行业经验过长' })
  industryExperience?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[]

  @IsOptional()
  @IsString()
  age?: string

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '政治面貌过长' })
  politicalStatus?: string

  @IsOptional()
  @IsArray()
  education?: IndividualEducationSegment[]

  @IsOptional()
  @IsArray()
  work?: IndividualWorkSegment[]

  @IsOptional()
  @IsArray()
  projects?: IndividualProjectSegment[]

  @IsOptional()
  @IsArray()
  honors?: IndividualHonorSegment[]

  @IsOptional()
  @IsArray()
  socials?: IndividualLinkSegment[]

  @IsOptional()
  @IsArray()
  customLinks?: IndividualLinkSegment[]

  /** 隐私开关：只更新显式传入的字段，省略时保留原设置。 */
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => IndividualCardVisibilityDto)
  visibility?: IndividualCardVisibilityDto
}
