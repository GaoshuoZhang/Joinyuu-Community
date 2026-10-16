import { IsArray, IsIn, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* 活动列表查询（wiki-backend.md §7.8）：keyword 匹配标题/ID；participant 按报名人筛选 */
export class QueryEventsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  type?: string

  /* 状态的多值查询：同时兼容单值（旧调用）与重复查询参数（?status=a&status=b）。
   * 空串是前端勾选式筛选「全不选」的占位（保证该字段在 URL 中可往返），归一后视为未过滤 */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    const list = (Array.isArray(value) ? value : [value]).map((v) => String(v)).filter((v) => v !== '')
    return list.length ? list : undefined
  })
  @IsArray()
  @IsIn(['pending_release', 'scheduled', 'published', 'ended', 'cancelled'], { each: true })
  status?: string[]

  @IsOptional()
  @IsString()
  participant?: string

  @IsOptional()
  @IsIn(['id', 'startTime', 'createdAt'])
  sortBy?: 'id' | 'startTime' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
