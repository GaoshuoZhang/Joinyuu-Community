import { IsArray, IsIn, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

const PROJECT_STATUSES = ['running', 'paused', 'closed', 'finished'] as const

/* 项目列表查询（wiki-backend.md §7.7）：page/pageSize/keyword(名称/code)/status/
 * participant(个人承接或其社区企业承接)/enterprise(社区企业按承接方 ID；合作企业按成员个人承接)/
 * sortBy(initiatedAt 默认、id)/sortOrder */
export class QueryProjectsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  /* 状态的多值查询：同时兼容单值（旧调用）与重复查询参数（?status=a&status=b）。
   * 空串是前端勾选式筛选「全不选」的占位（保证该字段在 URL 中可往返），归一后视为未过滤 */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    const list = (Array.isArray(value) ? value : [value]).map((v) => String(v)).filter((v) => v !== '')
    return list.length ? list : undefined
  })
  @IsArray()
  @IsIn([...PROJECT_STATUSES], { each: true })
  status?: string[]

  @IsOptional()
  @IsString()
  participant?: string

  @IsOptional()
  @IsString()
  enterprise?: string

  @IsOptional()
  @IsIn(['initiatedAt', 'id'])
  sortBy?: 'initiatedAt' | 'id'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
