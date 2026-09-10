import { IsNotEmpty, IsString } from 'class-validator'

export class QueryPointsRecordsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string
}
