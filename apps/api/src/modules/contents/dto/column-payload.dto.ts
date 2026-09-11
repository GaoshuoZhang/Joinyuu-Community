import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

/* 栏目新增/编辑载荷（对照 apps/admin/src/api/contents.ts ColumnPayload） */
export class ColumnPayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  description!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sort!: number

  /** 是否开放用户投稿 */
  @IsBoolean()
  submissionOpen!: boolean
}
