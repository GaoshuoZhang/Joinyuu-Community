import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/* 首页公告单例载荷（对照 apps/admin/src/api/announcements.ts HomeAnnouncementPayload） */
export class HomeAnnouncementPayloadDto {
  /** 兼容单例接口的定向更新：传 id 时仅更新该条；不传时沿用旧行为（覆盖最近一条） */
  @IsOptional()
  @IsString()
  id?: string

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
