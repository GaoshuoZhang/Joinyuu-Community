import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateUserDto {
  @IsOptional() @IsString({ message: '昵称格式不正确' }) @MaxLength(64, { message: '昵称过长' }) nickname?: string
  @IsOptional() @IsString({ message: '手机号格式不正确' }) @MaxLength(32, { message: '手机号过长' }) phone?: string
  @IsOptional() @IsString({ message: '邮箱格式不正确' }) @MaxLength(128, { message: '邮箱过长' }) email?: string
  @IsOptional() @IsIn(['男', '女'], { message: '性别仅支持男/女' }) gender?: string
  @IsOptional() @IsString() @MaxLength(64) realName?: string
  @IsOptional() @IsString() @MaxLength(32) citizenId?: string
  @IsOptional() @IsString() bio?: string
}
