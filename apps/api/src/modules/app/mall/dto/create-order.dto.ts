import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/* 商城兑换下单入参（M2-R R2）：goodsId 必填，实物必带 addressId，其余可选 */
export class CreateOrderDto {
  @IsString()
  goodsId!: string

  /** 实物商品所选发货方式：pickup 自提 | delivery 邮寄；
   * 商品仅支持单一方式时可省略（服务端按唯一方式兜底） */
  @IsOptional()
  @IsIn(['pickup', 'delivery'])
  shippingMethod?: 'pickup' | 'delivery'

  @IsOptional()
  @IsString()
  addressId?: string

  @IsOptional()
  @IsString()
  asIdentity?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}