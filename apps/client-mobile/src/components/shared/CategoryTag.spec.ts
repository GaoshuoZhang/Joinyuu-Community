import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryTag from './CategoryTag.vue'

const stubs = { TTag: { template: '<span class="tag-stub"><slot /></span>' } }

function styleOf(label: string): string {
  const wrapper = mount(CategoryTag, { props: { label }, global: { stubs } })
  return wrapper.get('.tag-stub').attributes('style') ?? ''
}

describe('CategoryTag', () => {
  it('keeps the same color family for the same label', () => {
    expect(styleOf('空间服务')).toBe(styleOf('空间服务'))
  })

  it('spreads different categories across multiple color families', () => {
    const labels = ['空间服务', '技术开发', '市场合作', '政策申报', '装修布置', '企业对接', '人才引育']
    const families = new Set(labels.map((label) => styleOf(label).match(/--app-entry-([a-z]+)-icon/)?.[1]))
    expect(families.size).toBeGreaterThan(1)
  })

  it('falls back to the brand tag slot when no entry color exists', () => {
    const style = styleOf('任意类别')
    expect(style).toContain('var(--td-tag-primary-color')
    expect(style).toContain('var(--td-tag-primary-light-color')
  })
})
