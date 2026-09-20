import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

/** 列表分页查询基类：时间/参数一致口径。
 * - 缺省 page=1、pageSize=10（admin/app 两端一致，O-01/O-03）
 * - pageSize 上限 100（O-02），超出返回 400「pageSize 不能大于 100」 */
export class PageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'pageSize 不能大于 100' })
  pageSize: number = 10
}
