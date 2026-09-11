import { IsIn, IsString } from 'class-validator'

/* 办公位维修登记/恢复载荷（入参 { status: idle | maintenance }） */
export class WorkstationStatusDto {
  @IsString()
  @IsIn(['idle', 'maintenance'])
  status!: string
}
