import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

/* 办公位新增/编辑载荷（对照 apps/admin/src/api/workstations.ts WorkstationPayload；
 * 契约：body 传 area 名称字符串（前端冻结），服务端解析为 areaId 外键；
 * 读取仍返回办公位 shape 中的 area 名称） */
export class WorkstationPayloadDto {
  @IsString()
  @IsNotEmpty()
  area!: string

  @IsString()
  @IsNotEmpty()
  seatNo!: string

  @IsString()
  @IsIn(['open', 'office', 'semi'])
  type!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number

  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultMonthlyRent?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  areaSqm?: number
}
