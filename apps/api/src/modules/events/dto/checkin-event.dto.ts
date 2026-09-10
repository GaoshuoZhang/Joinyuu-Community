import { IsNotEmpty, IsString } from 'class-validator'

export class CheckinEventDto {
  @IsString()
  @IsNotEmpty()
  userId!: string
}
