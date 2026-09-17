import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class BannerPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  title!: string

  @IsString()
  @MaxLength(128)
  subtitle!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  link?: string

  @IsInt()
  @Min(0)
  sort!: number

  @IsBoolean()
  enabled!: boolean
}

/** 轮播图总开关 */
export class BannerSettingsDto {
  @IsBoolean()
  carouselOpen!: boolean
}
