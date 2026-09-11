import { IsOptional, IsString } from 'class-validator'

/* POST /api/admin/demands/:id/reject 入参：reason 必填（Service 内校验，文案固定） */
export class RejectDemandDto {
  @IsOptional()
  @IsString()
  reason?: string
}
