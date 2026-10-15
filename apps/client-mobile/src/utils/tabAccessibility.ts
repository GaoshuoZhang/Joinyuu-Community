let sequence = 0

/** 面板可能懒加载或销毁，按业务 value 建立关系，避免依赖存活面板的 DOM 下标。 */
export function patchTabRelationships(tabs: HTMLElement) {
  const nav = tabs.querySelector<HTMLElement>('.t-tabs__nav')
  if (!nav) return
  let values: string[]
  try { values = JSON.parse(tabs.dataset.tabValues ?? '[]').map(String) } catch { return }
  nav.setAttribute('role', 'tablist')
  const items = [...nav.querySelectorAll<HTMLElement>('.t-tabs__item')]
  const panels = [...tabs.querySelectorAll<HTMLElement>('.t-tabs__panel')]
  if (!tabs.id) tabs.id = `app-tabs-${++sequence}`
  items.forEach((item, index) => {
    const value = values[index]
    if (value === undefined) return
    const panel = panels.find((candidate) => candidate.dataset.tabValue === value)
    const active = item.classList.contains('t-tabs__item--active')
    const id = `${tabs.id}-${encodeURIComponent(value)}`
    item.id = `${id}-tab`
    item.setAttribute('role', 'tab')
    item.setAttribute('aria-selected', String(active))
    item.tabIndex = active ? 0 : -1
    if (!panel) { item.removeAttribute('aria-controls'); return }
    panel.id = `${id}-panel`
    item.setAttribute('aria-controls', panel.id)
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', item.id)
    panel.setAttribute('aria-hidden', String(!active))
    panel.tabIndex = active ? 0 : -1
  })
}
