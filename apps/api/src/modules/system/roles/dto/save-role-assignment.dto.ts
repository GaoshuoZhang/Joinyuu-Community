import { IsArray, IsIn, IsString } from 'class-validator'

/* 角色权限 + 数据范围合并保存载荷：单事务落库，避免两步串行请求的部分失败中间态 */
export class SaveRoleAssignmentDto {
  @IsArray()
  @IsString({ each: true })
  permCodes!: string[]

  @IsArray()
  @IsIn(['members', 'biz', 'space', 'contents', 'mall', 'rules', 'system'], { each: true })
  dataScope!: string[]
}
