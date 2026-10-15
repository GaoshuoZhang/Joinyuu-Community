import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LevelTag from './LevelTag.vue'

const stubs = { TTag: { template: '<span class="tag-stub"><slot /></span>' } }

function styleOf(level: number): string {
  const wrapper = mount(LevelTag, { props: { level, name: '共创者' }, global: { stubs } })
  return wrapper.get('.tag-stub').attributes('style') ?? ''
}

describe('LevelTag', () => {
  it('renders the level and name', () => {
    const wrapper = mount(LevelTag, { props: { level: 3, name: '共创者' }, global: { stubs } })
    expect(wrapper.get('.tag-stub').text()).toBe('Lv.3 共创者')
  })

  it('uses the themed level color with a brand fallback', () => {
    const style = styleOf(3)
    expect(style).toContain('var(--app-level-3')
    /* 主题未提供等级色时回退品牌标签色，与既有企业库 Lv 标签一致 */
    expect(style).toContain('var(--td-tag-primary-color')
    expect(style).toContain('var(--td-tag-primary-light-color')
  })

  it('falls back to the brand tag for levels outside 1–10', () => {
    expect(styleOf(0)).not.toContain('--app-level-')
    expect(styleOf(11)).not.toContain('--app-level-')
    expect(styleOf(99)).toContain('var(--td-tag-primary-light-color')
  })
})
