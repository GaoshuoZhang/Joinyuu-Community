import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { USERNAME_PATTERN } from '../../../common/identity/identity-names'

export class UpdateUserDto {
  /** 用户名：全站唯一，不得占用保留名 */
  @IsOptional()
  @Matches(USERNAME_PATTERN, { message: '用户名需以字母开头，4-20 位，仅可包含字母、数字与下划线' })
  username?: string
  @IsOptional() @IsString({ message: '昵称格式不正确' }) @MaxLength(64, { message: '昵称过长' }) nickname?: string
  @IsOptional() @IsString({ message: '手机号格式不正确' }) @MaxLength(32, { message: '手机号过长' }) phone?: string
  @IsOptional() @IsString({ message: '邮箱格式不正确' }) @MaxLength(128, { message: '邮箱过长' }) email?: string
  /* 兼容后台历史中文值与客户端规范值（male/female/unknown，unknown=保密） */
  @IsOptional() @IsIn(['男', '女', 'male', 'female', 'unknown'], { message: '性别取值不合法' }) gender?: string
  @IsOptional() @IsString() @MaxLength(64) realName?: string
  @IsOptional() @IsString() @MaxLength(32) citizenId?: string
  @IsOptional() @IsString() bio?: string
}
