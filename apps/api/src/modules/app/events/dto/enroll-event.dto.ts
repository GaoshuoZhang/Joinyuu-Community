import { IsOptional, IsString, MaxLength } from 'class-validator'

/* 活动报名入参：留言（选填，随报名记录留存，后台报名审核可见） */
export class EnrollEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '留言最多 200 字' })
  message?: string
}