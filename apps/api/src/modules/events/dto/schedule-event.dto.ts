import { IsNotEmpty, IsString } from 'class-validator'

export class ScheduleEventDto {
  @IsString()
  @IsNotEmpty()
  scheduledAt!: string
}
