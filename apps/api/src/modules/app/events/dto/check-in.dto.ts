import { IsNotEmpty, IsNumber } from 'class-validator'

/* 客户端电子签到入参（M2-R R2）：经纬度由客户端定位上报，服务端做地理围栏校验 */
export class CheckInDto {
  @IsNumber()
  @IsNotEmpty()
  lat!: number

  @IsNumber()
  @IsNotEmpty()
  lng!: number
}