import { IsNumber, IsOptional, IsString } from 'class-validator'

/** 空间预约提交入参；主体快照由服务端根据 asIdentity/asEnterpriseId 生成。 */
export class CreateReservationDto {
  @IsString()
  spaceId!: string

  @IsString()
  date!: string

  @IsOptional()
  @IsString()
  start?: string

  @IsOptional()
  @IsString()
  end?: string

  @IsOptional()
  @IsString()
  topic?: string

  @IsOptional()
  @IsNumber()
  attendees?: number

  @IsOptional()
  @IsString()
  asIdentity?: string

  @IsOptional()
  @IsString()
  asEnterpriseId?: string
}
