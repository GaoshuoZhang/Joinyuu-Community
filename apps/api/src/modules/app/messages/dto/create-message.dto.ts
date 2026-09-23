import { IsString, MaxLength, MinLength } from 'class-validator'

/** POST /api/app/me/messages — 客户端提交留言（登录用户） */
export class CreateMessageDto {
  @IsString()
  @MinLength(2, { message: '留言主题至少 2 个字' })
  @MaxLength(60, { message: '留言主题最多 60 个字' })
  title!: string

  @IsString()
  @MinLength(5, { message: '留言内容至少 5 个字' })
  @MaxLength(1000, { message: '留言内容最多 1000 个字' })
  content!: string
}
