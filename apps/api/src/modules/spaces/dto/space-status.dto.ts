import { IsIn, IsString } from 'class-validator'

/* 空间状态切换载荷（对照 apps/admin/src/api/spaces.ts setSpaceStatus） */
export class SpaceStatusDto {
  @IsString()
  @IsIn(['available', 'maintenance', 'disabled'])
  status!: string
}
