import { Type } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator'

export class AdjustPointsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @Type(() => Number)
  @IsNumber()
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  delta!: number

  @IsString()
  reason!: string
}
