/**
 * 租约打印单「租赁信息」栏目目录（数组顺序即打印顺序）。
 *
 * 与后端 `apps/api/src/modules/workstations/workstations.service.ts` 的 `LEASE_PRINT_FIELD_KEYS`
 * 一一对应，两端新增/改名栏目必须同步（后端有单测锁定该键集）。
 * `wide = true` 的栏目独占整行（值单元格 colspan=3），与改造前打印单的版式保持一致。
 */
export interface LeasePrintFieldMeta {
  /** 字段键：与后端存储的 fields 对象键一致 */
  key: string
  /** 打印单上显示的中文栏目名 */
  label: string
  /** 独占整行（长文本栏目如办公位） */
  wide?: boolean
}

export const LEASE_PRINT_FIELDS: LeasePrintFieldMeta[] = [
  { key: 'renterName', label: '租赁方' },
  { key: 'renterType', label: '租赁方类型' },
  { key: 'contactName', label: '联系人' },
  { key: 'contactPhone', label: '联系电话' },
  { key: 'workstation', label: '办公位', wide: true },
  { key: 'leaseTerm', label: '租期' },
  { key: 'rentPeriod', label: '租赁周期' },
  { key: 'rent', label: '租金' },
  { key: 'status', label: '状态' },
  { key: 'terminatedAt', label: '终止日期', wide: true },
]

/** 栏目是否启用：缺键视为启用（后端已补全键集，这里再兜一层，键集不一致也不隐藏栏目） */
export function isLeasePrintFieldEnabled(fields: Record<string, boolean> | undefined, key: string): boolean {
  return fields?.[key] !== false
}
