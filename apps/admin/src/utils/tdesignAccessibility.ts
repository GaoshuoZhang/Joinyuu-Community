/**
 * TDesign Vue Next 1.20.7 的 Switch/TabNavItem/DialogCard 尚未提供完整键盘语义。
 * 仅补齐这些已核对的组件 DOM，不替换组件渲染、事件或业务状态。
 * 升级 TDesign 后应重新核对；已有语义的组件优先保留组件库实现。
 */
export function installTDesignAccessibility() {
  let sequence = 0
  let frame = 0
  let lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  let tabFocus: { nav: HTMLElement; element: HTMLElement } | null = null
  const modals: { element: HTMLElement; opener: HTMLElement | null }[] = []
  const visible = (node: HTMLElement) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
  const focusable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(
    'a[href], button, input:not([type="hidden"]), textarea, select, [tabindex], [contenteditable="true"]',
  )].filter((node) => node.tabIndex >= 0 && !node.closest('[inert], [aria-hidden="true"]') &&
    !node.matches(':disabled, [aria-disabled="true"]') && visible(node))
  const top = () => modals.at(-1)?.element
  const enter = (dialog: HTMLElement) => {
    const initial = dialog.querySelector<HTMLElement>('[autofocus]') ??
      focusable(dialog).find((node) => !node.closest('.t-dialog__close')) ?? dialog
    initial.focus({ preventScroll: true })
  }
  function refresh() {
    frame = 0
    document.querySelectorAll<HTMLElement>('.t-switch').forEach((node) => {
      if (!node.hasAttribute('role')) node.setAttribute('role', 'switch')
      if (node.getAttribute('role') !== 'switch') return
      const disabled = node.classList.contains('t-is-disabled') || node.classList.contains('t-is-loading')
      node.tabIndex = disabled ? -1 : 0
      node.setAttribute('aria-disabled', String(disabled))
      node.setAttribute('aria-checked', String(node.classList.contains('t-is-checked')))
    })
    document.querySelectorAll<HTMLElement>('.t-tabs__nav').forEach((nav) => {
      if (!nav.hasAttribute('role')) nav.setAttribute('role', 'tablist')
      const tabs = nav.closest('.t-tabs')
      const vertical = tabs?.querySelector('.t-tabs__header.t-is-left, .t-tabs__header.t-is-right') != null
      nav.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal')
      const label = tabs?.getAttribute('aria-label')
      if (label) nav.setAttribute('aria-label', label)
      const items = [...nav.querySelectorAll<HTMLElement>('.t-tabs__nav-item')]
      const selected = items.find((node) => node.classList.contains('t-is-active')) ?? items[0]
      items.forEach((node) => {
        if (!node.hasAttribute('role')) node.setAttribute('role', 'tab')
        const disabled = node.classList.contains('t-is-disabled')
        node.tabIndex = node === selected && !disabled ? 0 : -1
        node.setAttribute('aria-selected', String(node === selected))
        node.setAttribute('aria-disabled', String(disabled))
        node.querySelectorAll<HTMLElement>('.remove-btn').forEach((remove) => {
          remove.setAttribute('role', 'button')
          remove.tabIndex = node === selected ? 0 : -1
          remove.setAttribute('aria-label', `关闭${node.querySelector('.t-tabs__nav-item-text-wrapper')?.textContent?.trim() ?? '页签'}`)
        })
      })
      tabs?.querySelectorAll<HTMLElement>('.t-tabs__btn').forEach((button) => {
        if (button.matches('button')) return
        button.setAttribute('role', 'button')
        button.tabIndex = 0
        button.setAttribute('aria-label', button.classList.contains('t-tabs__btn--left') ? '查看前面的页签' : '查看后面的页签')
      })
    })
    // 关闭当前聚焦的页签后回到选中项，避免焦点掉回文档起点。
    if (tabFocus && !tabFocus.element.isConnected) {
      const previous = tabFocus
      tabFocus = null
      if (previous.nav.isConnected && (document.activeElement === document.body || !document.activeElement?.isConnected)) {
        previous.nav.querySelector<HTMLElement>('.t-tabs__nav-item.t-is-active')?.focus({ preventScroll: true })
      }
    }
    const dialogs = [...document.querySelectorAll<HTMLElement>('.t-dialog')].filter(visible)
    let restore: HTMLElement | null = null
    for (let index = modals.length - 1; index >= 0; index--) {
      const modal = modals[index]
      if (!dialogs.includes(modal.element)) {
        if (index === modals.length - 1) restore = modal.opener
        modals.splice(index, 1)
      }
    }
    for (const dialog of dialogs) {
      if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.tabIndex = -1
      const title = dialog.querySelector<HTMLElement>('.t-dialog__header-content')
      if (title) {
        if (!title.id) title.id = `admin-dialog-title-${++sequence}`
        dialog.setAttribute('aria-labelledby', title.id)
      }
      const close = dialog.querySelector<HTMLElement>('.t-dialog__close')
      if (close && !close.matches('button')) {
        close.setAttribute('role', 'button')
        close.setAttribute('aria-label', '关闭弹窗')
        close.tabIndex = 0
      }
      if (!modals.some((entry) => entry.element === dialog)) {
        modals.push({ element: dialog, opener: lastFocus })
        enter(dialog)
        restore = null
      }
    }
    if (restore?.isConnected && visible(restore)) restore.focus({ preventScroll: true })
    else if (restore && top()) enter(top()!)
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(refresh) }
  function onFocus(event: FocusEvent) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const dialog = top()
    // Select/DatePicker 等浮层通过 TDesign Popup 挂载到 body，允许其接收焦点。
    if (dialog && !dialog.contains(target) && !target.closest('.t-popup')) {
      enter(dialog)
      return
    }
    lastFocus = target
    const nav = target.closest<HTMLElement>('.t-tabs__nav')
    tabFocus = nav ? { nav, element: target } : null
  }
  function onKey(event: KeyboardEvent) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const control = target.closest<HTMLElement>('.t-switch, .remove-btn, .t-dialog__close, .t-tabs__btn')
    if (control && [' ', 'Enter'].includes(event.key) && control.getAttribute('aria-disabled') !== 'true' && !control.matches('button')) {
      event.preventDefault()
      event.stopPropagation()
      control.click()
      schedule()
      return
    }
    const tab = target.closest<HTMLElement>('.t-tabs__nav-item')
    if (tab && target === tab) {
      const nav = tab.closest('.t-tabs__nav')!
      const items = [...nav.querySelectorAll<HTMLElement>('.t-tabs__nav-item:not(.t-is-disabled)')]
      const index = items.indexOf(tab)
      let next: HTMLElement | undefined
      const vertical = nav.getAttribute('aria-orientation') === 'vertical'
      if (event.key === (vertical ? 'ArrowDown' : 'ArrowRight')) next = items[(index + 1) % items.length]
      if (event.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) next = items[(index - 1 + items.length) % items.length]
      if (event.key === 'Home') next = items[0]
      if (event.key === 'End') next = items.at(-1)
      if ([' ', 'Enter'].includes(event.key)) next = tab
      if (event.key === 'Delete' && tab.querySelector<HTMLElement>('.remove-btn')) {
        event.preventDefault()
        tab.querySelector<HTMLElement>('.remove-btn')!.click()
        schedule()
        return
      }
      if (next) {
        event.preventDefault()
        next.click()
        next.focus({ preventScroll: true })
        schedule()
        return
      }
    }
    const dialog = top()
    if (event.key !== 'Tab' || !dialog) return
    const nodes = focusable(dialog)
    const first = nodes[0] ?? dialog
    const last = nodes.at(-1) ?? dialog
    if (event.shiftKey && (target === first || target === dialog || !dialog.contains(target))) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (target === last || target === dialog || !dialog.contains(target))) {
      event.preventDefault(); first.focus()
    }
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
  document.addEventListener('focusin', onFocus)
  document.addEventListener('keydown', onKey, true)
  schedule()
  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('keydown', onKey, true)
  }
}
