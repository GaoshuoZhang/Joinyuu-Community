import { IsOptional, IsString, MaxLength } from 'class-validator'

/** 下架不依赖举报；只有非空理由才发送给内容所属用户。 */
export class TakedownDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  takedownReason?: string
}
