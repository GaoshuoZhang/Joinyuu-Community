import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

/* 空间创建/编辑载荷（对照 apps/admin/src/api/spaces.ts SpacePayload） */
export class SpacePayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsIn(['meeting', 'roadshow', 'meeting_room', 'multi', 'study'])
  type!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number

  @IsString()
  location!: string

  @IsString()
  openTime!: string

  @IsString()
  closeTime!: string

  @IsBoolean()
  allDay!: boolean

  @IsBoolean()
  needReservation!: boolean

  @IsBoolean()
  needApproval!: boolean

  @IsArray()
  @IsString({ each: true })
  equipment!: string[]

  @IsString()
  description!: string
}
