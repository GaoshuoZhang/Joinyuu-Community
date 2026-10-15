import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { collectAllPages, executeBulk } from '../src/utils/bulkOperation.ts'
import { addRentPeriod } from '../src/utils/calendar.ts'
import { formSnapshot, normalizeEmptyHtml } from '../src/utils/formSnapshot.ts'
import { undertakerValue, customUndertakerName } from '../src/utils/projectUndertakers.ts'
import { installTDesignAccessibility } from '../src/utils/tdesignAccessibility.ts'
import { existingProjectDemander } from '../src/utils/projectDemander.ts'
import { parseMobileUrl } from '../src/utils/mobileUrl.ts'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'

test('a project keeps its existing requester identity when option services are slow or unavailable', () => {
  const project = { demanderId: 'E1', demanderName: '历史企业', demanderIdentity: { type: 'community_enterprise', enterpriseId: 'E1' } }
  assert.deepEqual(existingProjectDemander('enterprise:E1', project), project)
  assert.equal(existingProjectDemander('自定义需求方', project), null)
  assert.equal(existingProjectDemander('enterprise:E2', project), null)
  assert.equal(existingProjectDemander('user:U1', null), null)
  assert.equal(existingProjectDemander('enterprise:XE1', { demanderId: 'XE1', demanderName: '历史合作企业' }).demanderIdentity.type, 'external_enterprise')
})

test('mobile deployment addresses preserve subpaths and reject unsupported or credential-bearing URLs', () => {
  assert.equal(parseMobileUrl(' localhost:7759 ').href, 'http://localhost:7759/')
  assert.equal(parseMobileUrl('https://mobile.example.com/community/').pathname, '/community/')
  for (const value of ['', '/relative', 'ftp://example.com', 'https://user:secret@example.com', 'https://example.com?x=1', 'https://example.com#/', 'local host:7759', 'http://example.com\\other']) assert.equal(parseMobileUrl(value), null, value)
})

test('bulk collection includes records beyond 2000 and fails rather than silently skipping a repeated page', async () => {
  const rows = Array.from({ length: 2351 }, (_, id) => ({ id }))
  const result = await collectAllPages(async (page, size) => ({ list: rows.slice((page - 1) * size, page * size), total: rows.length }))
  assert.equal(result.length, 2351)
  assert.equal(result.at(-1).id, 2350)
  await assert.rejects(collectAllPages(async () => ({ list: [{ id: 1 }], total: 3 })), /数据范围发生变化/)
})

test('bulk cancellation during collection performs no work; execution reports partial failures accurately', async () => {
  let cancelled = false
  const collected = await collectAllPages(async () => { cancelled = true; return { list: [{ id: 1 }], total: 1 } }, () => cancelled)
  assert.deepEqual(collected, [])
  cancelled = false
  const attempted = []
  const progress = []
  const result = await executeBulk([1, 2, 3, 4], async id => {
    attempted.push(id)
    if (id === 1) throw new Error('failed')
    if (id === 2) cancelled = true
  }, () => cancelled, state => progress.push(state))
  assert.deepEqual(attempted, [1, 2])
  assert.deepEqual(result, { done: 2, total: 4, failed: 1 })
  assert.deepEqual(progress[0], { done: 0, total: 4, failed: 0 })
})

test('rent period arithmetic clamps month ends and leap years', () => {
  assert.equal(addRentPeriod('2027-01-31', 'month'), '2027-02-28')
  assert.equal(addRentPeriod('2028-01-31', 'month'), '2028-02-29')
  assert.equal(addRentPeriod('2028-02-29', 'year'), '2029-02-28')
  assert.equal(addRentPeriod('2026-12-31', 'month'), '2027-01-31')
  assert.equal(addRentPeriod('2026-12-31', 'week'), '2027-01-07')
})

test('form snapshots ignore empty editor normalization but retain every submitted nested change', () => {
  assert.equal(normalizeEmptyHtml('<p><br></p>'), '')
  assert.equal(formSnapshot({ description: '' }), formSnapshot({ description: '<p><br></p>' }))
  const initial = { tags: [], shares: [60, 40], contacts: [{ phone: '123' }], milestones: [{ owners: ['甲'] }], customVisibility: false }
  for (const changed of [
    { ...initial, tags: ['新增'] }, { ...initial, shares: [50, 50] },
    { ...initial, contacts: [{ phone: '456' }] }, { ...initial, milestones: [{ owners: ['乙'] }] },
    { ...initial, customVisibility: true },
  ]) assert.notEqual(formSnapshot(initial), formSnapshot(changed))
  assert.notEqual(formSnapshot({ content: '<p>正文</p>' }), formSnapshot({ content: '' }))
  assert.notEqual(formSnapshot({ content: '<p><img src="x"></p>' }), formSnapshot({ content: '' }))
})

test('legacy custom project undertakers have distinct reversible keys independent of empty refIds', () => {
  const rows = ['甲公司', '乙:公司 / A%'].map(name => ({ type: 'custom', id: '', name }))
  const values = rows.map(undertakerValue)
  assert.equal(new Set(values).size, 2)
  assert.deepEqual(values.map(customUndertakerName), rows.map(row => row.name))
  assert.equal(undertakerValue({ type: 'enterprise', id: 'E1', name: '甲' }), 'enterprise:E1')
})

// Render real TDesign 1.20.7 components in a DOM. No requests or business writes occur.
const dom = new JSDOM('<!doctype html><body><div id="fixture"></div></body>', { pretendToBeVisual: true, url: 'http://localhost/' })
const previous = new Map()
for (const key of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'MutationObserver', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  const value = typeof dom.window[key] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key)
    ? dom.window[key].bind(dom.window) : dom.window[key]
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
}
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
dom.window.HTMLElement.prototype.getClientRects = function () {
  let node = this
  while (node) {
    if (node.hidden || dom.window.getComputedStyle(node).display === 'none') return []
    node = node.parentElement
  }
  return this.isConnected ? [{ width: 100, height: 32 }] : []
}
const { createApp, h, reactive, nextTick } = await import('vue')
const { Button, Checkbox, CheckboxGroup, Dialog, DialogPlugin, Progress, Switch, Tabs, TabPanel } = await import('tdesign-vue-next')
const settle = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 90)); await nextTick() }
after(async () => {
  await new Promise(resolve => setTimeout(resolve, 400))
  dom.window.close()
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

test('real TDesign switches and tabs expose state and support keyboard activation', async () => {
  const state = reactive({ enabled: false, tab: 'a' })
  const app = createApp({ render: () => h('div', [
    h(Switch, { value: state.enabled, 'aria-label': '启用', onChange: value => { state.enabled = value } }),
    h(Tabs, { value: state.tab, onChange: value => { state.tab = value } }, () => [h(TabPanel, { value: 'a', label: 'A' }), h(TabPanel, { value: 'b', label: 'B' })]),
  ]) })
  app.mount('#fixture')
  const dispose = installTDesignAccessibility()
  try {
    await settle()
    const toggle = document.querySelector('.t-switch')
    assert.equal(toggle.getAttribute('role'), 'switch')
    toggle.focus()
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await settle()
    assert.equal(state.enabled, true)
    assert.equal(toggle.getAttribute('aria-checked'), 'true')
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    tabs[0].focus()
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    await settle()
    assert.equal(state.tab, 'b')
    assert.equal(document.activeElement, tabs[1])
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
    assert.equal(tabs[0].tabIndex, -1)
  } finally { dispose(); app.unmount() }
})

test('real TDesign dialogs enter focus, contain Tab, support nested plugin dialogs and restore the opener', async () => {
  const state = reactive({ open: false })
  const app = createApp({ render: () => h('div', [
    h(Button, { id: 'opener', onClick: () => { state.open = true } }, () => '打开'),
    h(Dialog, { visible: state.open, header: '编辑记录', onClose: () => { state.open = false } }, () => h('input', { id: 'modal-field' })),
  ]) })
  app.mount('#fixture')
  const dispose = installTDesignAccessibility()
  try {
    const opener = document.querySelector('#opener')
    opener.focus(); opener.click()
    await settle()
    const dialog = document.querySelector('.t-dialog')
    assert.equal(dialog.getAttribute('role'), 'dialog')
    assert.equal(dialog.getAttribute('aria-modal'), 'true')
    assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent.includes('编辑记录'))
    assert.equal(document.activeElement.id, 'modal-field')
    const buttons = [...dialog.querySelectorAll('button')]
    buttons.at(-1).focus()
    buttons.at(-1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    assert.equal(document.activeElement, dialog.querySelector('.t-dialog__close'))
    document.querySelector('#modal-field').focus()
    const confirm = DialogPlugin.confirm({ header: '放弃修改', body: '确认？' })
    await settle()
    assert.ok(!dialog.contains(document.activeElement))
    confirm.destroy()
    await new Promise(resolve => setTimeout(resolve, 400))
    await settle()
    assert.equal(document.activeElement.id, 'modal-field')
    state.open = false
    await new Promise(resolve => setTimeout(resolve, 400))
    await settle()
    assert.equal(document.activeElement, opener)
  } finally { dispose(); app.unmount() }
})

test('closing focused TDesign tabs repeatedly restores focus to the remaining selected tab', async () => {
  const state = reactive({ selected: 'c', items: ['a', 'b', 'c'] })
  const app = createApp({ render: () => h(Tabs, {
    value: state.selected, onChange: value => { state.selected = value },
    onRemove: ({ value }) => { state.items = state.items.filter(item => item !== value); state.selected = state.items.at(-1) },
  }, () => state.items.map(value => h(TabPanel, { value, label: value, removable: value !== 'a' }))) })
  app.mount('#fixture')
  const dispose = installTDesignAccessibility()
  try {
    await settle()
    document.querySelector('.t-tabs__nav-item.t-is-active').focus()
    for (const value of ['b', 'a']) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
      await settle()
      assert.equal(state.selected, value)
      assert.equal(document.activeElement, document.querySelector('.t-tabs__nav-item.t-is-active'))
    }
  } finally { dispose(); app.unmount() }
})

test('deselecting all bulk states cancels the pending estimate and ignores its late result', async () => {
  const source = readFileSync(new URL('../src/components/BulkArchiveDialog.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: 'bulk-estimate-regression', inlineTemplate: true })
  const js = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(createRequire(import.meta.url), module, module.exports)
  let completeFirst
  let calls = 0
  const state = reactive({ open: false })
  const app = createApp({ render: () => h(module.exports.default, {
    visible: state.open, title: '批量归档', statuses: [{ value: 'ended', label: '已结束' }],
    countForStatus: () => ++calls === 1 ? new Promise(resolve => { completeFirst = resolve }) : Promise.resolve(5),
  }) })
  for (const [name, component] of Object.entries({ 't-dialog': Dialog, 't-checkbox': Checkbox, 't-checkbox-group': CheckboxGroup, 't-progress': Progress, 't-button': Button })) app.component(name, component)
  app.mount('#fixture')
  try {
    state.open = true
    await settle()
    assert.match(document.querySelector('.archive-estimate').textContent, /正在统计/)
    const checkbox = document.querySelector('input[type="checkbox"]')
    checkbox.click()
    await settle()
    assert.match(document.querySelector('.archive-estimate').textContent, /预计影响 0 条/)
    completeFirst(99)
    await settle()
    assert.match(document.querySelector('.archive-estimate').textContent, /预计影响 0 条/)
    checkbox.click()
    await settle()
    assert.match(document.querySelector('.archive-estimate').textContent, /预计影响 5 条/)
    assert.equal([...document.querySelectorAll('button')].find(node => node.textContent.includes('确认归档')).disabled, false)
  } finally { app.unmount() }
})
