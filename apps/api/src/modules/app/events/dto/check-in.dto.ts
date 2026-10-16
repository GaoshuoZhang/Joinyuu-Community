import { IsNumber, IsOptional, IsString } from 'class-validator'

/* 客户端电子签到入参：
 * 位置开关开启时上报经纬度（服务端做地理围栏校验）；
 * 签到码启用时必传 6 位 code（连续错误 4 次起需附图形验证码 captchaId/captchaCode） */
export class CheckInDto {
  @IsOptional()
  @IsNumber()
  lat?: number

  @IsOptional()
  @IsNumber()
  lng?: number

  @IsOptional()
  @IsString()
  code?: string

  @IsOptional()
  @IsString()
  captchaId?: string

  @IsOptional()
  @IsString()
  captchaCode?: string
}