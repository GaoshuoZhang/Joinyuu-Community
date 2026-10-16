import { IsOptional, IsString } from 'class-validator'

/* GET /api/admin/demands/:id/selected-respondents 查询参数
 * respondentIds：逗号分隔的响应记录 ID（「立项前置选定承接方」勾选项）；缺省时按需求方「已选定」响应返回 */
export class QuerySelectedRespondentsDto {
  @IsOptional()
  @IsString()
  respondentIds?: string
}
