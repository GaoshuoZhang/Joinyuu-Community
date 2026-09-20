import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/** 个人中心资料更新（昵称/性别/简介/邮箱/头像） */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '昵称过长' })
  nickname?: string

  @IsOptional()
  @IsIn(['male', 'female', 'unknown', '男', '女', '保密'])
  gender?: string

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '简介过长' })
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '邮箱过长' })
  email?: string

  /** 头像上传后返回的 url。 */
  @IsOptional()
  @IsString()
  avatar?: string
}
