import { Transform } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

/* 新增管理员：角色以角色码提交；初始密码可选，缺省时服务端随机生成（强度同重置密码） */
export class CreateAdminDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '请输入账号' })
  @MaxLength(64)
  username!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '请输入姓名' })
  @MaxLength(64)
  name!: string

  @IsArray()
  @ArrayNotEmpty({ message: '请选择角色' })
  @IsString({ each: true })
  roleCodes!: string[]

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '初始密码至少 8 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '初始密码需同时包含字母与数字' })
  password?: string
}
