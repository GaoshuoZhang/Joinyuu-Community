import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/* POST/PUT /api/admin/mall/goods 入参（GoodsPayload，apps/admin/src/api/mall.ts）
 * 兑换积分为正整数、库存为非负整数（与商品表单输入约束一致）；
 * 发货方式仅实物商品可选（pickup 自提 / delivery 邮寄），范围字段为空数组表示不限 */
export class GoodsPayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString({ message: '请选择商品类型' })
  @IsNotEmpty({ message: '请选择商品类型' })
  category!: string

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

  @IsOptional()
  @IsArray()
  @IsIn(['pickup', 'delivery'], { each: true })
  shippingMethods?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupAddress?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99999)
  shippingFee?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibilityIdentities?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibilityLevels?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderIdentities?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderLevels?: string[]
}
