import { BadRequestException } from '@nestjs/common'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/** Business-owned cash pricing. Omitted pairs preserve existing settings on edit. */
export class BusinessChargeDto {
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) chargeAmountFen?: number
  @IsOptional() @IsString() @MaxLength(2000) chargeRefundPolicy?: string
}

export function businessChargeData(input: BusinessChargeDto) {
  if (input.chargeAmountFen === undefined && input.chargeRefundPolicy === undefined) return {}
  const amount = input.chargeAmountFen
  const policy = input.chargeRefundPolicy?.trim()
  if (!Number.isSafeInteger(amount) || amount! < 0 || amount! > 100_000_000 || policy === undefined || policy.length > 2000 || (amount! > 0 && !policy)) {
    throw new BadRequestException('请同时填写现金收费金额与退款约定；收费金额为 0 表示未设置现金收费')
  }
  return { chargeAmountFen: amount, chargeRefundPolicy: policy }
}

export function exclusivePriceData(input: BusinessChargeDto, points: number, previous?: BusinessChargeDto, requirePrice = false) {
  const charge = businessChargeData(input)
  const amount = charge.chargeAmountFen ?? previous?.chargeAmountFen ?? 0
  if (!Number.isSafeInteger(points) || points < 0 || (points > 0 && amount > 0)) throw new BadRequestException('积分和现金只能选择一种计价方式，不支持混合支付')
  if (requirePrice && points === 0 && amount === 0) throw new BadRequestException('请选择积分售价或现金售价，并填写大于 0 的价格')
  return charge
}
