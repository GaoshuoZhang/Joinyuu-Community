import { BusinessChargeDto } from '../../../common/dto/business-charge.dto'
import { Type } from 'class-transformer'
import {
  IsArray,
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
export class GoodsPayloadDto extends BusinessChargeDto {
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
  @Min(0)
  points!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number

  /** 编辑时的库存基线（弹窗打开时库内值）：与 stock 相等表示未调整库存，服务端跳过库存写入，
   * 避免用表单旧值覆盖期间的下单扣减/退款回补；新增时不传 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseStock?: number

  /** 券码有效期（天）：0=不过期，空值按30天兜底 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
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
