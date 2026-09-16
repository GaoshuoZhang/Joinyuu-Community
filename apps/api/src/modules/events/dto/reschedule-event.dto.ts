import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class RescheduleEventDto {
  @IsString()
  @IsNotEmpty()
  startTime!: string

  @IsString()
  @IsNotEmpty()
  endTime!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string
}
