import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator'

/* 编辑管理员：账号不可改，仅姓名与角色 */
export class UpdateAdminDto {
  @IsString()
  @IsNotEmpty({ message: '请输入姓名' })
  @MaxLength(64)
  name!: string

  @IsArray()
  @ArrayNotEmpty({ message: '请选择角色' })
  @IsString({ each: true })
  roleCodes!: string[]
}
