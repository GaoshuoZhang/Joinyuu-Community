import { IsIn, IsNotEmpty, IsString } from 'class-validator'

export class QueryExperienceRecordsDto {
  @IsIn(['enterprise', 'individual'])
  targetType!: 'enterprise' | 'individual'

  @IsString()
  @IsNotEmpty()
  targetId!: string
}
