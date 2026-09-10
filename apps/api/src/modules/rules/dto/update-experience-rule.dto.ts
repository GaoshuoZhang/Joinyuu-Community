import { Type } from 'class-transformer'
import { IsNumber } from 'class-validator'

/* PUT /api/admin/rules/experience/:code 入参（仅经验值可编辑）
 * 正整数业务校验在 Service（错误文案与 M0 一致「经验值必须为正整数」），DTO 仅做数值类型约束 */
export class UpdateExperienceRuleDto {
  @Type(() => Number)
  @IsNumber()
  exp!: number
}
