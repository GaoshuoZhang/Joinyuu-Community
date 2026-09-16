import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

/* PUT /api/admin/system/config 载荷（对照 apps/admin/src/api/systemConfig.ts SystemConfigPayload）。
 * 校验文案逐字一致；空串由服务层二次校验（class-validator 不拦空串）。 */
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

  @Type(() => Number)
  @IsInt({ message: '密码有效期须为 0-3650 的整数（0 表示不启用）' })
  @Min(0, { message: '密码有效期须为 0-3650 的整数（0 表示不启用）' })
  @Max(3650, { message: '密码有效期须为 0-3650 的整数（0 表示不启用）' })
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

  @IsString()
  @MaxLength(128)
  minioSecretKey!: string

  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9.-]{1,62}$/, { message: 'Bucket 名称格式不正确' })
  minioBucket!: string
}
