import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateUserDto {
  @IsString({ message: '昵称格式不正确' }) @IsNotEmpty({ message: '请输入昵称' }) @MaxLength(64, { message: '昵称过长' }) nickname!: string
  @IsString({ message: '联系电话格式不正确' }) @IsNotEmpty({ message: '请输入联系电话' }) @MaxLength(32, { message: '联系电话过长' }) phone!: string
  @IsString({ message: '邮箱格式不正确' }) @IsNotEmpty({ message: '请输入邮箱' }) @MaxLength(128, { message: '邮箱过长' }) email!: string
  @IsIn(['男', '女'], { message: '性别仅支持男/女' }) gender!: string
  @IsOptional() @IsString() @MaxLength(64) realName?: string
  @IsOptional() @IsString() @MaxLength(32) citizenId?: string
  @IsOptional() @IsString() bio?: string
}
