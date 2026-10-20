import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

/* PUT /api/admin/leases/print-layout 租约打印版式（全局单例）。
 * 三个字段均可选：只传其中一项时，服务端按「未传即保持原值」合并。 */
export class UpdateLeasePrintLayoutDto {
  /** 打印单标题（纯文本，留空回落默认标题） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string

  /** 「租赁信息」栏目可见性：{ 字段键: 是否显示 }；键集见 LEASE_PRINT_FIELD_KEYS，未知键服务端忽略 */
  @IsOptional()
  @IsObject()
  fields?: Record<string, boolean>

  /** 「条款说明」纯文本（支持换行分段；留空则回落内置三条条款） */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clausesText?: string
}
