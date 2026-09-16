import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/* 公告新增/编辑载荷（对照 apps/admin/src/api/announcements.ts AnnouncementPayload） */
export class AnnouncementPayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  content!: string

  @IsBoolean()
  pinned!: boolean

  @IsOptional()
  @IsString()
  expireAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  link?: string
}
