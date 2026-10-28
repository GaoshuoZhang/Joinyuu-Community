import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class SavePaymentConfigDto {
  @IsInt() @Min(0) version!: number
  @IsBoolean() enabled!: boolean
  @IsString() @MaxLength(64) mchid!: string
  @IsString() @MaxLength(64) appid!: string
  @IsString() @MaxLength(128) serial!: string
  @IsString() @MaxLength(128) publicKeyId!: string
  @IsString() @MaxLength(255) base!: string
  @IsOptional() @IsString() @MaxLength(64) key?: string
  @IsOptional() @IsString() @MaxLength(32768) privateKey?: string
  @IsOptional() @IsString() @MaxLength(32768) publicKey?: string
  @IsOptional() @IsString() @MaxLength(32768) certificate?: string
  /** 公众号 AppSecret（只写，用于 JSAPI 网页授权换取 OpenID） */
  @IsOptional() @IsString() @MaxLength(128) appSecret?: string
  /** 客户端站点 HTTPS 源站（网页授权/H5 支付完成后回跳） */
  @IsOptional() @IsString() @MaxLength(255) clientBase?: string
}
