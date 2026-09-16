import { IsOptional, IsString, MaxLength } from 'class-validator'

export class ShipOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  trackingNo?: string
}
