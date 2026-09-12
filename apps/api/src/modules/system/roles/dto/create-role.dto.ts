import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/* 新增角色：编码全局唯一且不可占用内置编码；权限点创建后经「权限配置」分配 */
export class CreateRoleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '请输入角色编码' })
  @Matches(/^[a-z][a-z0-9_]{1,31}$/, { message: '角色编码需以小写字母开头，仅含小写字母/数字/下划线，长度 2-32' })
  code!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '请输入角色名称' })
  @MaxLength(64, { message: '角色名称最长 64 字' })
  name!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '角色说明最长 255 字' })
  description?: string
}
