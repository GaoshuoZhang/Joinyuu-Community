import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp, effectScope, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { restoreColumnState, visibleColumnKeys } from '../src/utils/columnState.ts'
import { countAxis } from '../src/utils/chartTicks.ts'
import { useRecordDetail } from '../src/utils/recordDetail.ts'
import { useTabsStore } from '../src/stores/tabs.ts'

test('column preferences preserve hidden columns and order while exposing newly added columns', () => {
  const raw = JSON.stringify({ version: 2, knownKeys: ['name', 'status', 'op', 'removed'], order: ['status', 'removed', 'name', 'op'], visible: ['name'] })
  const restored = restoreColumnState(raw, ['name', 'status', 'added', 'op'], ['op'])
  assert.deepEqual(restored.order, ['status', 'name', 'op', 'added'])
  assert.deepEqual(visibleColumnKeys(restored), ['name', 'op', 'added'])
  assert.deepEqual(restoreColumnState(JSON.stringify(restored), restored.knownKeys, ['op']), restored)
})

test('column preferences migrate legacy caches and recover malformed data', () => {
  assert.deepEqual(visibleColumnKeys(restoreColumnState('["status","status","missing"]', ['name', 'status', 'op'], ['op'])), ['status', 'op'])
  for (const raw of ['{', 'null', '{"version":2,"knownKeys":false}', '42']) {
    assert.deepEqual(visibleColumnKeys(restoreColumnState(raw, ['name', 'op'], ['op'])), ['name', 'op'])
  }
})

test('count charts have distinct integer ticks that cover all finite data', () => {
  for (const values of [[], [0], [1, 2], [3], [51, 117], [-3, 8], [NaN, Infinity, 2]]) {
    const axis = countAxis(values)
    assert.equal(new Set(axis.ticks).size, axis.ticks.length)
    assert.ok(axis.ticks.length >= 2)
    assert.ok(axis.ticks.every(Number.isInteger))
    for (const value of values.filter(Number.isFinite)) assert.ok(axis.min <= value && axis.max >= value)
  }
})

test('tabs retain latest full paths, adjacent queries and the permanent dashboard', () => {
  const tabs = useTabsStore(createPinia())
  tabs.add({ path: '/list', fullPath: '/list?page=2', title: '列表', closable: true })
  tabs.add({ path: '/detail', fullPath: '/detail?record=7', title: '详情', closable: true })
  tabs.add({ path: '/list', fullPath: '/list?page=4&tab=review', title: '列表', closable: true })
  assert.equal(tabs.tabs.length, 3)
  assert.equal(tabs.remove('/detail'), '/list?page=4&tab=review')
  assert.equal(tabs.remove('/dashboard'), null)
  tabs.closeOthers('/list')
  assert.deepEqual(tabs.tabs.map(tab => tab.fullPath), ['/dashboard', '/list?page=4&tab=review'])
})

async function recordContext(url, load) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/list', component: {} }] })
  const app = createApp({})
  app.use(router)
  await router.push(url)
  const scope = effectScope()
  const detail = scope.run(() => app.runWithContext(() => useRecordDetail(load)))
  const settle = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); await nextTick() }
  return { router, detail, settle, stop: () => scope.stop() }
}

test('record deep links preserve filters, support history navigation and retry errors', async () => {
  let fail = true
  const ctx = await recordContext('/list?tab=pending&page=3&record=a', async id => {
    if (id === 'a' && fail) throw new Error('详情暂不可用')
    return { id }
  })
  try {
    await ctx.settle()
    assert.equal(ctx.detail.visible.value, true)
    assert.equal(ctx.detail.error.value, '详情暂不可用')
    fail = false
    await ctx.detail.reload()
    assert.deepEqual(ctx.detail.current.value, { id: 'a' })
    ctx.detail.open('b')
    await ctx.settle()
    assert.deepEqual(ctx.router.currentRoute.value.query, { tab: 'pending', page: '3', record: 'b' })
    ctx.router.back()
    await ctx.settle()
    assert.equal(ctx.detail.current.value.id, 'a')
    ctx.router.forward()
    await ctx.settle()
    assert.equal(ctx.detail.current.value.id, 'b')
    ctx.detail.close()
    await ctx.settle()
    assert.equal(ctx.detail.visible.value, false)
    assert.deepEqual(ctx.router.currentRoute.value.query, { tab: 'pending', page: '3' })
  } finally { ctx.stop() }
})

test('late record responses cannot overwrite a new selection, a closed drawer or a disposed page', async () => {
  const pending = new Map()
  const ctx = await recordContext('/list?record=a', id => new Promise(resolve => pending.set(id, resolve)))
  ctx.detail.open('b')
  await ctx.settle()
  pending.get('b')({ id: 'b' })
  await ctx.settle()
  pending.get('a')({ id: 'a' })
  await ctx.settle()
  assert.equal(ctx.detail.current.value.id, 'b')
  ctx.detail.open('c')
  await ctx.settle()
  ctx.detail.close()
  await ctx.settle()
  pending.get('c')({ id: 'c' })
  await ctx.settle()
  assert.equal(ctx.detail.current.value, null)
  assert.equal(ctx.detail.visible.value, false)
  ctx.detail.open('d')
  await ctx.settle()
  ctx.stop()
  pending.get('d')({ id: 'd' })
  await ctx.settle()
  assert.equal(ctx.detail.current.value, null)
})
