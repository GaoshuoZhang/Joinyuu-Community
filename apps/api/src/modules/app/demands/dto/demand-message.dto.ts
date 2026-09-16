import { IsString, MaxLength, MinLength } from 'class-validator'

/* POST /demands/:id/messages 入参（留言 1-500 字） */
export class DemandMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string
}