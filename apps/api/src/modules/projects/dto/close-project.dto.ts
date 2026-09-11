import { IsOptional, IsString } from 'class-validator'

/* 项目关闭：reason 必填（空/空白串由 Service 校验，错误文案固定） */
export class CloseProjectDto {
  @IsOptional()
  @IsString()
  reason?: string
}
