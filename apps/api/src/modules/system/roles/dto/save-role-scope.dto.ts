import { IsArray, IsIn } from 'class-validator'

/* 角色数据范围保存载荷：域键数组；空数组 = 不限制全部 */
export const DATA_SCOPE_DOMAINS = ['members', 'biz', 'space', 'contents', 'mall', 'rules', 'commerce', 'system']

export class SaveRoleScopeDto {
  @IsArray()
  @IsIn(DATA_SCOPE_DOMAINS, { each: true })
  dataScope!: string[]
}
