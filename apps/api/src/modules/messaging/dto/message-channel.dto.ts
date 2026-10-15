import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { CHANNEL_KINDS } from '../messaging.types'

/* 通知固定配置载荷：按类型保存；凭据可直接填写（只写）或登记环境变量名。 */
export class MessageChannelPayloadDto {
  @IsIn(CHANNEL_KINDS, { message: '消息类型不合法' })
  kind!: string

  @IsString({ message: '请选择消息驱动' })
  @MaxLength(32)
  provider!: string

  @IsString({ message: '渠道名称不能为空' })
  @MaxLength(64)
  name!: string

  @IsBoolean()
  enabled!: boolean

  /** 非机密配置（signName / host / from / templateMapping 等），键值均为字符串或字符串映射 */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>

  /** 凭据来源：inline 后台直接填写（只写，留空保持原值）| env 登记环境变量名（缺省 env） */
  @IsOptional()
  @IsIn(['inline', 'env'], { message: '凭据来源不合法' })
  credentialMode?: string

  /** 凭据：inline 模式填密钥值（留空保持不变）；env 模式填环境变量名 */
  @IsOptional()
  @IsObject()
  credentialEnv?: Record<string, unknown>

  @Type(() => Number)
  @IsInt({ message: '每日发送上限须为 0-100000 的整数' })
  @Min(0, { message: '每日发送上限须为 0-100000 的整数' })
  @Max(100000, { message: '每日发送上限须为 0-100000 的整数' })
  dailyLimit!: number

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/** PATCH /api/admin/message-channels/:id/enabled */
export class ToggleChannelDto {
  @IsBoolean()
  enabled!: boolean
}

/** POST /api/admin/message-channels/:id/test-send（测试发送；不写 Outbox） */
export class TestSendDto {
  @IsString({ message: '请输入测试收件人' })
  @MaxLength(128)
  recipient!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateCode?: string

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>

  /** 直接指定正文时优先（便于未建模板前连通性验证） */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  subject?: string
}
