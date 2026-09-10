import { IsOptional, IsString } from 'class-validator'

/* POST /api/admin/demands/:id/reject 入参：reason 必填（Service 内校验，文案与 M0 一致） */
export class RejectDemandDto {
  @IsOptional()
  @IsString()
  reason?: string
}
