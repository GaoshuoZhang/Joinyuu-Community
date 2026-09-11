import { Type } from 'class-transformer'
import { IsNumber } from 'class-validator'

/* PUT /api/admin/mall/points-rules/:code 入参（仅积分值可编辑）
 * 正整数业务校验在 Service（错误文案固定「积分值必须为正整数」），DTO 仅做数值类型约束 */
export class UpdatePointsRuleDto {
  @Type(() => Number)
  @IsNumber()
  points!: number
}
