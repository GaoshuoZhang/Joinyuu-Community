import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator'

/* PUT /api/admin/trash/settings/:domain 归档设置（按标签页独立配置） */
export class UpdateArchiveSettingDto {
  @IsOptional()
  @IsBoolean()
  autoArchive?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  archiveDelayDays?: number

  @IsOptional()
  @IsBoolean()
  autoPurge?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  purgeDelayDays?: number

  /** 按状态的自动归档开关：{ 状态值: 是否启用 }（仅限该标签页支持的状态） */
  @IsOptional()
  @IsObject()
  archiveStatuses?: Record<string, boolean>
}
