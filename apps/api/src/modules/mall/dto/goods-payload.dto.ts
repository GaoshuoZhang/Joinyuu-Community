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
 * 统一券码兑换：商品仅保留名称/分类/积分/库存/有效期（天）/描述与可见范围；
 * 不再支持履约类型、发货方式、自提地址与运费 */
export class GoodsPayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string

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

  /** 券码有效期（天）：空值按 30 天兜底 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validDays?: number

  @IsString()
  description!: string

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
