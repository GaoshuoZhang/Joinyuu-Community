import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { CHANNEL_KINDS, TEMPLATE_CATEGORIES } from '../messaging.types'

/* 模板中心载荷（P0）：变量白名单 + 版本化 + 审批。 */

export class CreateTemplateDto {
  @IsString({ message: '请输入模板编码' })
  @MaxLength(64)
  code!: string

  @IsString({ message: '请输入模板名称' })
  @MaxLength(64)
  name!: string

  @IsIn(CHANNEL_KINDS, { message: '消息类型不合法' })
  kind!: string

  @IsIn(TEMPLATE_CATEGORIES, { message: '模板分类不合法' })
  category!: string

  /** 变量白名单（模板正文/主题只能引用这些变量） */
  @IsArray()
  @IsString({ each: true })
  variables!: string[]

  @IsOptional()
  @IsString()
  @MaxLength(128)
  subject?: string

  @IsString({ message: '模板正文不能为空' })
  @MinLength(1, { message: '模板正文不能为空' })
  @MaxLength(4000)
  body!: string
}

export class SaveTemplateDraftDto {
  @IsString({ message: '请输入模板名称' })
  @MaxLength(64)
  name!: string

  @IsIn(TEMPLATE_CATEGORIES, { message: '模板分类不合法' })
  category!: string

  @IsArray()
  @IsString({ each: true })
  variables!: string[]

  @IsOptional()
  @IsString()
  @MaxLength(128)
  subject?: string

  @IsString({ message: '模板正文不能为空' })
  @MinLength(1, { message: '模板正文不能为空' })
  @MaxLength(4000)
  body!: string
}

/** 审核：approve=true 通过；false 驳回（note 必填） */
export class ReviewTemplateDto {
  @IsBoolean()
  approve!: boolean

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string
}

/** 发布/回滚到指定版本；缺省发布最新待发布版本 */
export class PublishTemplateDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number
}

/** 模板预览不发送消息，无需收件人。 */
export class PreviewTemplateDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>
}

/** 测试发送仍需校验收件人。 */
export class TestTemplateDto extends PreviewTemplateDto {
  @IsString({ message: '请输入测试收件人' })
  @MaxLength(128)
  recipient!: string
}
