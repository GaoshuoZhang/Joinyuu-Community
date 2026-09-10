import { Type } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsString } from 'class-validator'

export class AdjustPointsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @Type(() => Number)
  @IsNumber()
  delta!: number

  @IsString()
  reason!: string
}
