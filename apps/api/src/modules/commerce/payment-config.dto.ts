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
}
