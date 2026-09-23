import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/** POST /api/admin/user-messages/:id/reply — 后台回复用户留言 */
export class ReplyMessageDto {
  @IsString()
  @MinLength(2, { message: '回复内容至少 2 个字' })
  @MaxLength(1000, { message: '回复内容最多 1000 个字' })
  content!: string
}

/** GET /api/admin/user-messages 查询条件（分页继承 PageQueryDto） */
export class QueryUserMessagesDto extends PageQueryDto {
  /** 状态筛选：pending 待回复 | replied 已回复 */
  @IsOptional()
  @IsString()
  status?: string

  /** 关键词：留言主题 / 内容 / 用户 UID */
  @IsOptional()
  @IsString()
  keyword?: string

  /** 排序字段：目前仅支持 createdAt（提交时间）；省略时按「待回复置顶 + 提交时间倒序」 */
  @IsOptional()
  @IsIn(['createdAt'], { message: '不支持的排序字段' })
  sortBy?: string

  /** 排序方向：ascend 升序 | descend 降序（默认） */
  @IsOptional()
  @IsIn(['ascend', 'descend'], { message: '不支持的排序方向' })
  sortOrder?: string
}
