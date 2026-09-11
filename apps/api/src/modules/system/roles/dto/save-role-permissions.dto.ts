import { IsArray, IsString } from 'class-validator'

/* 角色权限保存载荷：permCodes 为权限码集合；['*'] 表示全量 */
export class SaveRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permCodes!: string[]
}
