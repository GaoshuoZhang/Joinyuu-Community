import { IsArray, ArrayNotEmpty, ArrayUnique, IsString } from 'class-validator'

/* 通知偏好更新入参：启用的类型集合（['all'] 或合法子集，至少一种） */
export class NoticePrefsDto {
  @IsArray()
  @ArrayNotEmpty({ message: '至少保留一种通知类型' })
  @ArrayUnique()
  @IsString({ each: true })
  enabledTypes!: string[]
}
