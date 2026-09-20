import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/* 首页公告单例载荷（对照 apps/admin/src/api/announcements.ts HomeAnnouncementPayload） */
export class HomeAnnouncementPayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  content!: string

  /** 开启后展示在客户端首页搜索栏下方的公告条；全局仅一条 */
  @IsBoolean()
  enabled!: boolean

  @IsOptional()
  @IsString()
  @MaxLength(128)
  link?: string
}
