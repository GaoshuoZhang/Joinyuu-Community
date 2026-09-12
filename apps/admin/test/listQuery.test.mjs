import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp, effectScope, nextTick, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useListQueryState } from '../src/utils/listQuery.ts'

async function setup(url = '/list') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/list', component: {} }, { path: '/detail', component: {} }],
  })
  const app = createApp({})
  app.use(router)
  await router.push(url)
  await router.isReady()
  const scope = effectScope()
  const bind = (...args) => scope.run(() => app.runWithContext(() => useListQueryState(...args)))
  const settle = async () => {
    await nextTick()
    await new Promise(resolve => setImmediate(resolve))
    await nextTick()
  }
  return { router, bind, settle, stop: () => scope.stop() }
}

test('restores numeric pagination, filters and date ranges before first load', async () => {
  const ctx = await setup('/list?page=3&pageSize=20&keyword=聚屿&range=2026-01-01&range=2026-02-01')
  const state = reactive({ page: 1, pageSize: 10, keyword: '', range: ['', ''] })
  let requests = 0
  ctx.bind(state, () => requests++)
  assert.deepEqual({ ...state }, { page: 3, pageSize: 20, keyword: '聚屿', range: ['2026-01-01', '2026-02-01'] })
  assert.equal(requests, 0, 'setup must not duplicate the page mount request')
  ctx.stop()
})

test('search commits once, clearing filters removes query keys and preserves unrelated tab state', async () => {
  const ctx = await setup('/list?tab=login')
  const state = reactive({ page: 1, keyword: '' })
  let requests = 0
  const { syncQuery } = ctx.bind(state, () => requests++)
  state.keyword = 'alice'
  await ctx.settle()
  assert.equal(ctx.router.currentRoute.value.query.keyword, undefined, 'typing does not silently apply server filters')
  syncQuery()
  await ctx.settle()
  assert.equal(ctx.router.currentRoute.value.query.keyword, 'alice')
  assert.equal(ctx.router.currentRoute.value.query.tab, 'login')
  assert.equal(requests, 0, 'own URL commit must not issue a second load')
  state.keyword = ''
  syncQuery()
  await ctx.settle()
  assert.deepEqual(ctx.router.currentRoute.value.query, { tab: 'login' })
  ctx.stop()
})

test('external navigation restores missing keys to defaults; back and forward reload once', async () => {
  const ctx = await setup('/list?page=4&keyword=old')
  const state = reactive({ page: 1, keyword: '' })
  let requests = 0
  ctx.bind(state, () => requests++)
  await ctx.router.push('/list')
  await ctx.settle()
  assert.deepEqual({ ...state }, { page: 1, keyword: '' })
  assert.equal(requests, 1)
  ctx.router.back()
  await ctx.settle()
  assert.deepEqual({ ...state }, { page: 4, keyword: 'old' })
  assert.equal(requests, 2)
  ctx.router.forward()
  await ctx.settle()
  assert.equal(state.page, 1)
  assert.equal(requests, 3)
  ctx.stop()
})

test('rejects invalid pagination rather than sending NaN, zero or unbounded sizes', async () => {
  for (const query of ['page=NaN&pageSize=999999', 'page=-1&pageSize=0', 'page=1.5&pageSize=abc']) {
    const ctx = await setup('/list?' + query)
    const state = reactive({ page: 1, pageSize: 10 })
    ctx.bind(state)
    assert.deepEqual({ ...state }, { page: 1, pageSize: 10 })
    ctx.stop()
  }
})

test('prefixes isolate embedded lists and unrelated query changes do not reload', async () => {
  const ctx = await setup('/list?audit.page=3&login.page=2&tab=login')
  const audit = reactive({ page: 1 })
  const login = reactive({ page: 1 })
  let requests = 0
  ctx.bind(audit, () => requests++, { prefix: 'audit.' })
  ctx.bind(login, () => requests++, { prefix: 'login.' })
  assert.equal(audit.page, 3)
  assert.equal(login.page, 2)
  await ctx.router.replace({ query: { ...ctx.router.currentRoute.value.query, tab: 'audit' } })
  await ctx.settle()
  assert.equal(requests, 0)
  ctx.stop()
})

test('ref filters and legacy aliases round-trip without polluting another route', async () => {
  const ctx = await setup('/list?publisher=U1001&status=active')
  const state = reactive({ publisherId: '' })
  const status = ref('')
  const { syncQuery } = ctx.bind(state, undefined, { refs: { status }, aliases: { publisherId: 'publisher' }, live: true })
  assert.equal(state.publisherId, 'U1001')
  assert.equal(status.value, 'active')
  status.value = 'frozen'
  await ctx.settle()
  assert.equal(ctx.router.currentRoute.value.query.status, 'frozen')
  assert.equal(ctx.router.currentRoute.value.query.publisherId, undefined)
  await ctx.router.push('/detail')
  state.publisherId = 'U1002'
  syncQuery()
  await ctx.settle()
  assert.equal(ctx.router.currentRoute.value.path, '/detail')
  assert.deepEqual(ctx.router.currentRoute.value.query, {})
  ctx.stop()
})
