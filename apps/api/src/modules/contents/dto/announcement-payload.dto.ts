import { IsBoolean, IsNotEmpty, IsString } from 'class-validator'

/* 公告创建/编辑载荷（对照 apps/admin/src/api/announcements.ts AnnouncementPayload） */
export class AnnouncementPayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  content!: string

  @IsBoolean()
  pinned!: boolean
}
