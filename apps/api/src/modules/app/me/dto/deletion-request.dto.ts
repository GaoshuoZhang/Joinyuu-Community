import { IsOptional, IsString, MaxLength } from 'class-validator'

/** 提交账号注销申请（原因可选） */
export class DeletionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '注销原因过长' })
  reason?: string
}