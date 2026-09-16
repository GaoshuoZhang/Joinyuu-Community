import { IsString, MaxLength } from 'class-validator'

/** 投稿驳回后申诉（一次性）入参 */
export class AppealArticleDto {
  @IsString()
  @MaxLength(255, { message: '申诉理由过长' })
  reason!: string
}