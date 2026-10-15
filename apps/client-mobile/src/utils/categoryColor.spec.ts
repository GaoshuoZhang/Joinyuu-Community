import { describe, expect, it } from 'vitest'
import { categoryColorStyle, categoryEntryKey } from './categoryColor'

/** 社区里实际存在的类别文案样本（需求分类 / 政策分类 / 资讯栏目 / 商品类别 / 活动类型） */
const SAMPLE = [
  '供应链', '设计', '沙龙', '培训', '社区动态', '空间服务', '技术开发', '市场合作',
  '政策申报', '装修布置', '企业对接', '人才引育', '找服务', '找投资', '找合作',
  '人才政策', '补贴申报', '社交', '创业', '投资', '路演', '通用商品', '券码兑换',
  '活动', '资讯', '技术需求', '链上协作',
]

describe('categoryColor', () => {
  it('keeps a category on the same color family（筛选 chip 与列表标签同色）', () => {
    expect(categoryEntryKey('供应链')).toBe(categoryEntryKey('供应链'))
    expect(categoryColorStyle('供应链')).toEqual(categoryColorStyle('供应链'))
  })

  it('spreads the real category set across most of the six color families', () => {
    const families = new Set(SAMPLE.map((label) => categoryEntryKey(label)))
    expect(families.size).toBeGreaterThanOrEqual(5)

    /* 单个色位不应吃掉超过三分之一的类别（避免一个列表里多张卡同色） */
    const counts = new Map<string, number>()
    for (const label of SAMPLE) {
      const key = categoryEntryKey(label)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(SAMPLE.length / 3)
  })

  it('falls back to the brand tag slot when a theme entry color is missing', () => {
    const style = categoryColorStyle('任意类别')
    expect(style.color).toContain('var(--td-tag-primary-color')
    expect(style.backgroundColor).toContain('var(--td-tag-primary-light-color')
    expect(style.borderColor).toBe(style.backgroundColor)
  })
})
