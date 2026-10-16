/* 响应审核「向需求方显示」字段口径（响应审核通过时由管理员勾选，取消勾选的字段对需求方隐藏）。
 * 键与 DemandRespondent 上响应方提交的字段一一对应，也是客户端发布者视图实际渲染的字段集合。 */
export const RESPONDENT_VISIBILITY_FIELDS = [
  /** 响应说明（DemandRespondent.message） */
  'message',
  /** 报价（quote） */
  'quote',
  /** 可投入时间 / 预计工期（timeline） */
  'timeline',
  /** 相关经验与案例（cases） */
  'cases',
  /** 联系手机（phone） */
  'phone',
  /** 联系邮箱（email） */
  'email',
] as const

export type RespondentVisibilityField = (typeof RESPONDENT_VISIBILITY_FIELDS)[number]

/** 字段是否对需求方可见（hiddenFields 为空数组 = 全部可见） */
export function respondentFieldVisible(
  hiddenFields: readonly string[],
  field: RespondentVisibilityField,
): boolean {
  return !hiddenFields.includes(field)
}

/** 归一化隐藏字段入参：去重 + 仅保留合法键（非法键静默丢弃，由 DTO 校验兜底拦截） */
export function normalizeHiddenFields(input: readonly string[] | undefined): RespondentVisibilityField[] {
  if (!input?.length) return []
  const valid = new Set<string>(RESPONDENT_VISIBILITY_FIELDS)
  return [...new Set(input.filter((field): field is RespondentVisibilityField => valid.has(field)))]
}
