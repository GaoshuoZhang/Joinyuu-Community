import { describe, expect, it } from 'vitest'
import { patchTabRelationships } from './tabAccessibility'

describe('动态 Tab 面板关系', () => {
  it('首个面板销毁后仍按 value 关联，恢复时不产生错误名称', () => {
    const tabs = document.createElement('div')
    tabs.dataset.tabValues = JSON.stringify(['service', 'talent'])
    tabs.innerHTML = '<div class="t-tabs__nav"><div class="t-tabs__item">社区服务</div><div class="t-tabs__item t-tabs__item--active">人才库</div></div><div class="t-tabs__panel" data-tab-value="talent"></div>'
    patchTabRelationships(tabs)
    const items = tabs.querySelectorAll('.t-tabs__item')
    const panel = tabs.querySelector('.t-tabs__panel')!
    expect(panel.getAttribute('aria-labelledby')).toBe(items[1].id)
    expect(items[0].hasAttribute('aria-controls')).toBe(false)
    expect(items[1].getAttribute('aria-controls')).toBe(panel.id)
    const restored = document.createElement('div')
    restored.className = 't-tabs__panel'
    restored.dataset.tabValue = 'service'
    tabs.append(restored)
    patchTabRelationships(tabs)
    expect(restored.getAttribute('aria-labelledby')).toBe(items[0].id)
    expect(restored.tabIndex).toBe(-1)
    expect(panel.getAttribute('aria-labelledby')).toBe(items[1].id)
  })
})
