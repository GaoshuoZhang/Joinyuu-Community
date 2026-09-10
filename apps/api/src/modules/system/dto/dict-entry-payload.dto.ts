import { IsString } from 'class-validator'

/* POST /api/admin/dicts/:type 载荷（label 即业务存储值；全类型唯一由服务层校验） */
export class DictEntryPayloadDto {
  @IsString({ message: '请输入字典项名称' })
  label!: string
}
