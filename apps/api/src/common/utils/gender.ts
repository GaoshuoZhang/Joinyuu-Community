/* 性别字段统一：库内规范值为 male / female / unknown（unknown=保密）。
 * 兼容历史中文值（男/女/保密）读写，读取路径一律归一为规范值，展示层映射为中文文案。 */
const GENDER_CODE: Record<string, 'male' | 'female' | 'unknown'> = {
  male: 'male',
  female: 'female',
  unknown: 'unknown',
  男: 'male',
  女: 'female',
  保密: 'unknown',
}

export type UserGenderCode = 'male' | 'female' | 'unknown'

/** 任意历史/规范性别值 → 规范 code（未知与空值兜底 unknown） */
export function normalizeGender(value?: string | null): UserGenderCode {
  if (!value) return 'unknown'
  return GENDER_CODE[value.trim()] ?? 'unknown'
}
