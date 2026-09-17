import { ArrayMinSize, IsArray, IsInt, Min } from 'class-validator'

/* POST /me/demands/:id/select 入参：发布者选择的意向承接方（单选或多选） */
export class SelectRespondersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  responseIds!: number[]
}
