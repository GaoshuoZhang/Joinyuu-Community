import { Type } from 'class-transformer'
import { IsIn, IsNotEmpty, IsNumber, IsString } from 'class-validator'

export class AdjustExperienceDto {
  @IsIn(['enterprise', 'individual'])
  targetType!: 'enterprise' | 'individual'

  @IsString()
  @IsNotEmpty()
  targetId!: string

  @Type(() => Number)
  @IsNumber()
  delta!: number

  @IsString()
  reason!: string
}
