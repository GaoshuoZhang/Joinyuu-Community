import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/* 活动反馈入参（M2-R R2）：1~5 星必填 + 可选文字 */
export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string
}