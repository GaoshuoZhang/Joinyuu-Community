import { IsDateString, Matches } from 'class-validator'

/* 使用看板查询参数：date 必须为 YYYY-MM-DD。
 * BE-M8 修复：缺参/非法时校验失败（400），避免 Prisma 忽略 undefined 导致回退到全表扫描。 */
export class UsageBoardQueryDto {
  @IsDateString({}, { message: 'date 需为 YYYY-MM-DD 格式' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 需为 YYYY-MM-DD 格式' })
  date!: string
}