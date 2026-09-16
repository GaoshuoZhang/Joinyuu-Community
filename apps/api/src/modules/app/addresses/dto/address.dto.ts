import { IsBoolean, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator'

/* 收货地址入参（M2-R R1）：name/phone/region/detail 必填，phone 11 位校验，isDefault 可选 */
export class AddressDto {
  @IsString()
  @Length(1, 64)
  name!: string

  @IsString()
  @Matches(/^1\d{10}$/, { message: '联系电话格式不正确' })
  phone!: string

  @ValidateIf((o: AddressDto) => !o.address)
  @IsString()
  @Length(1, 128)
  region?: string

  @ValidateIf((o: AddressDto) => !o.address)
  @IsString()
  @Length(1, 255)
  detail?: string

  /** 兼容移动端现有“省市区 + 门牌”单字段；服务层规范化到 detail。 */
  @IsOptional()
  @IsString()
  @Length(5, 255)
  address?: string

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}
