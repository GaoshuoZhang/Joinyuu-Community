import { IsOptional, IsString } from 'class-validator'

/* POST /api/admin/demands/:id/proxy-respond 入参（管理员代成员响应需求）
 * phone 必填（Service 内校验，文案固定）；message 空 → 记「管理员代报名」 */
export class ProxyRespondDemandDto {
  @IsString()
  userName!: string

  @IsString()
  enterprise!: string

  @IsString()
  phone!: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  quote?: string

  @IsOptional()
  @IsString()
  message?: string
}
