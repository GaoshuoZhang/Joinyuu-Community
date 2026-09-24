import { IsOptional, IsString, MaxLength } from 'class-validator'

/* 商城兑换下单入参（统一券码兑换）：goodsId 必填，备注可选；
 * 下单即签发券码，现场核销，无需地址与发货方式 */
export class CreateOrderDto {
  @IsString()
  goodsId!: string

  @IsOptional()
  @IsString()
  asIdentity?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}
