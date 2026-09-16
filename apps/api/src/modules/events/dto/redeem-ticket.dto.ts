import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class RedeemTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string
}
