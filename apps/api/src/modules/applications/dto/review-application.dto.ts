import { IsOptional, IsString } from 'class-validator'

export class ReviewApplicationDto {
  @IsOptional()
  @IsString()
  comment?: string
}
