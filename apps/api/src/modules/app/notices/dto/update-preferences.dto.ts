import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator'
import { MUTABLE_NOTICE_TYPES } from '../../../../common/notify/notification-types'

/* PUT /api/app/notices/preferences 入参：仅允许静音可配置类型（system 等安全通知不可静音） */
export class UpdateNoticePreferencesDto {
  @IsArray()
  @ArrayMaxSize(MUTABLE_NOTICE_TYPES.length)
  @IsString({ each: true })
  @IsIn(MUTABLE_NOTICE_TYPES, { each: true, message: '通知类型不支持静音' })
  mutedTypes!: string[]
}
