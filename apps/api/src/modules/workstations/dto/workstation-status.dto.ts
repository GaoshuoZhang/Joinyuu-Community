import { IsIn, IsString } from 'class-validator'

/* 工位维修登记/恢复载荷（对照 M0 setWorkstationStatus 入参 { status: idle | maintenance }） */
export class WorkstationStatusDto {
  @IsString()
  @IsIn(['idle', 'maintenance'])
  status!: string
}
