import { Type } from 'class-transformer'
import { IsIn, IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator'

export class AdjustExperienceDto {
  @IsIn(['enterprise', 'individual'])
  targetType!: 'enterprise' | 'individual'

  @IsString()
  @IsNotEmpty()
  targetId!: string

  @Type(() => Number)
  @IsNumber()
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  delta!: number

  @IsString()
  reason!: string
}
