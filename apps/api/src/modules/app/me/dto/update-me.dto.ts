import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { NICKNAME_MAX_LENGTH, USERNAME_PATTERN } from '../../../../common/identity/identity-names'

/** 个人中心资料更新（用户名/昵称/性别/简介/头像）。
 * 用户名与昵称需全站唯一且不得占用保留名；邮箱/手机号变更走专门的验证端点。 */
export class UpdateMeDto {
  /** 用户名：字母开头，4-20 位，仅字母/数字/下划线 */
  @IsOptional()
  @Matches(USERNAME_PATTERN, { message: '用户名需以字母开头，4-20 位，仅可包含字母、数字与下划线' })
  username?: string

  /** 昵称：允许中文，最长 20 字符 */
  @IsOptional()
  @IsString()
  @MaxLength(NICKNAME_MAX_LENGTH, { message: `昵称不能超过 ${NICKNAME_MAX_LENGTH} 个字符` })
  nickname?: string

  @IsOptional()
  @IsIn(['male', 'female', 'unknown', '男', '女', '保密'])
  gender?: string

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '简介过长' })
  bio?: string

  /** 头像上传后返回的 url。 */
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '头像地址过长' })
  avatar?: string
}
