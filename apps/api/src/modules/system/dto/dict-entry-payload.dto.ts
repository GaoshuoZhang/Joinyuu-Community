import { IsArray, IsOptional, IsString } from 'class-validator'

/* 商品类别（type=goods_category）的类别级「可见范围 / 可下单范围」载荷（空数组 = 不限）；
 * 其余字典类型不涉及；字段缺省表示不修改（PUT）/ 空数组（POST）。 */
class DictScopePayloadDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibilityIdentities?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibilityLevels?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderIdentities?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderLevels?: string[]
}

/* POST /api/admin/dicts/:type 载荷（label 即业务存储值；全类型唯一由服务层校验） */
export class DictEntryPayloadDto extends DictScopePayloadDto {
  @IsString({ message: '请输入字典项名称' })
  label!: string
}

/* PUT /api/admin/dicts/:type/:code：前端编辑弹窗整表单提交（名称与范围可改） */
export class UpdateDictEntryDto extends DictScopePayloadDto {
  @IsOptional()
  @IsString({ message: '请输入字典项名称' })
  label?: string
}