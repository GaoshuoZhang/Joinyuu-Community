import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

/* POST/PUT /api/admin/mall/goods 入参（GoodsPayload，apps/admin/src/api/mall.ts）
 * 兑换积分为正整数、库存为非负整数（与商品表单输入约束一致） */
export class GoodsPayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsIn(['physical', 'virtual', 'voucher'])
  category!: 'physical' | 'virtual' | 'voucher'

  @Type(() => Number)
  @IsInt()
  @Min(1)
  points!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number

  @IsString()
  description!: string
}
