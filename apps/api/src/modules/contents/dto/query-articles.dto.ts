import { IsArray, IsIn, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/contents/articles 查询参数（keyword 匹配标题/作者/编号；sortBy 默认 id） */
export class QueryArticlesDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  columnId?: string

  @IsOptional()
  @IsIn(['official', 'submitted'])
  channel?: 'official' | 'submitted'

  /* 状态的多值查询：同时兼容单值（旧调用）与重复查询参数（?status=a&status=b）。
   * 空串是前端勾选式筛选「全不选」的占位（保证该字段在 URL 中可往返），归一后视为未过滤 */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    const list = (Array.isArray(value) ? value : [value]).map((v) => String(v)).filter((v) => v !== '')
    return list.length ? list : undefined
  })
  @IsArray()
  @IsIn(['pending', 'rejected', 'pending_release', 'scheduled', 'published', 'closed'], { each: true })
  status?: string[]

  @IsOptional()
  @IsIn(['id', 'views', 'createdAt'])
  sortBy?: 'id' | 'views' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
