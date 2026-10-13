import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/* PUT /api/admin/system/config 载荷（对照 apps/admin/src/api/systemConfig.ts SystemConfigPayload）。
 * 校验文案逐字一致；空串由服务层二次校验（class-validator 不拦空串）。
 * 密钥安全（P0）：minioSecretKey 为只写字段——缺省/空串表示保持原值，非空表示更新或轮换；服务端不回传原文。 */
export class SystemConfigPayloadDto {
  @IsString({ message: '站点名称不能为空' })
  siteName!: string

  @IsString()
  siteSlogan!: string

  @IsBoolean()
  registrationOpen!: boolean

  @IsBoolean()
  mallOpen!: boolean

  @IsBoolean()
  demandOpen!: boolean

  @IsBoolean()
  reservationOpen!: boolean

  /** 开启后，未实名用户不能发布需求或报名活动。 */
  @IsBoolean()
  realnameRequired!: boolean

  /** P1 实名核验：是否启用权威二要素核验（缺省不启用，保持向后兼容） */
  @IsOptional()
  @IsBoolean()
  realnameVerifyEnabled?: boolean

  /** 核验供应商（单选）：'' 未选择 | aliyun | tencent（缺省未选择） */
  @IsOptional()
  @IsIn(['', 'aliyun', 'tencent'], { message: '核验供应商不合法' })
  realnameVerifyProvider?: string

  /** 凭据来源：inline 后台直接填写（只写，留空保持原值）| env 登记环境变量名 */
  @IsOptional()
  @IsIn(['inline', 'env'], { message: '凭据来源不合法' })
  realnameVerifyCredentialMode?: string

  /** 非机密参数（endpoint / region） */
  @IsOptional()
  @IsObject()
  realnameVerifyConfig?: Record<string, unknown>

  /** 凭据环境变量名映射（仅存变量名，值由部署侧注入） */
  @IsOptional()
  @IsObject()
  realnameVerifyCredentialEnv?: Record<string, unknown>

  /** 开启后，客户端首页不展示轮播区域。 */
  @IsBoolean()
  homeCarouselOpen!: boolean

  @Type(() => Number)
  @IsInt({ message: '租约临期提醒窗口须为 1-90 的整数' })
  @Min(1, { message: '租约临期提醒窗口须为 1-90 的整数' })
  @Max(90, { message: '租约临期提醒窗口须为 1-90 的整数' })
  leaseExpireRemindDays!: number

  @Type(() => Number)
  @IsInt({ message: '上传文件大小限制须为 1-100 的整数' })
  @Min(1, { message: '上传文件大小限制须为 1-100 的整数' })
  @Max(100, { message: '上传文件大小限制须为 1-100 的整数' })
  uploadMaxSizeMb!: number

  /** 密码过期强制改密（仅后台管理员账号）：缺省 false = 密码永不过期（保持存量兼容） */
  @IsOptional()
  @IsBoolean()
  passwordExpireEnabled?: boolean

  @Type(() => Number)
  @IsInt({ message: '密码过期周期须为 1-3650 的整数' })
  @Min(1, { message: '密码过期周期须为 1-3650 的整数' })
  @Max(3650, { message: '密码过期周期须为 1-3650 的整数' })
  passwordExpireDays!: number

  @IsBoolean()
  minioEnabled!: boolean

  @IsString()
  @MaxLength(255)
  minioEndpoint!: string

  @Type(() => Number)
  @IsInt({ message: 'MinIO 端口须为 1-65535 的整数' })
  @Min(1, { message: 'MinIO 端口须为 1-65535 的整数' })
  @Max(65535, { message: 'MinIO 端口须为 1-65535 的整数' })
  minioPort!: number

  @IsBoolean()
  minioUseSsl!: boolean

  @IsString()
  @MaxLength(128)
  minioAccessKey!: string

  /** 只写字段：缺省/空串 = 保持原值不变；非空 = 更新或轮换。服务端不回传、不审计其原文。 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  minioSecretKey?: string

  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9.-]{1,62}$/, { message: 'Bucket 名称格式不正确' })
  minioBucket!: string
}
