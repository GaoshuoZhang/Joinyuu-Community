import { IsIn, IsNotEmpty, IsString } from 'class-validator'

/* 办公位区域新增/编辑载荷（对照 apps/admin/src/api/workstations.ts WorkstationAreaPayload） */
export class WorkstationAreaPayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsIn(['open', 'office', 'semi'])
  type!: string

  @IsString()
  description!: string
}
