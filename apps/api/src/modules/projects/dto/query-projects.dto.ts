import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* 项目列表查询（wiki-backend.md §7.7）：page/pageSize/keyword(名称/code)/status/
 * participant(个人承接或其社区企业承接)/enterprise(社区企业按承接方 ID；外部企业按成员个人承接)/
 * sortBy(initiatedAt 默认、id)/sortOrder */
export class QueryProjectsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize!: number

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsIn(['running', 'paused', 'closed', 'finished'])
  status?: 'running' | 'paused' | 'closed' | 'finished'

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
