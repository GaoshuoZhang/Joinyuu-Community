import { MaxLength, MinLength, IsString } from 'class-validator'

/* POST /me/projects/:id/discussions 讨论发言（1-500 字） */
export class AddDiscussionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string
}