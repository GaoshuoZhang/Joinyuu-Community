import { IsOptional, IsString, MaxLength } from 'class-validator'

/* 商城兑换下单入参（M2-R R2）：goodsId 必填，实物必带 addressId，其余可选 */
export class CreateOrderDto {
  @IsString()
  goodsId!: string

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