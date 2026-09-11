import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsString, Max, Min } from 'class-validator'

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
}
