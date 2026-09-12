import { onScopeDispose, watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'

type Options = {
  prefix?: string
  refs?: Record<string, Ref>
  aliases?: Record<string, string>
  live?: boolean
}

/** Server lists commit on search/page change; client-filtered lists opt into live sync. */
export function useListQueryState(state: Record<string, unknown>, reload?: () => unknown, options: Options = {}) {
  const route = useRoute()
  const router = useRouter()
  const path = route.path
  const fields = { ...Object.fromEntries(Object.keys(state).map(k => [k, {
    get: () => state[k], set: (v: unknown) => { state[k] = v },
  }])), ...Object.fromEntries(Object.entries(options.refs ?? {}).map(([k, r]) => [k, {
    get: () => r.value, set: (v: unknown) => { r.value = v },
  }])) }
  const clone = (value: unknown): unknown => Array.isArray(value) ? [...value] : value
  const defaults = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, clone(f.get())]))
  const keyFor = (key: string) => `${options.prefix ?? ''}${options.aliases?.[key] ?? key}`
  const snapshot = () => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.get()]))
  const signature = (query: LocationQuery | LocationQueryRaw) => JSON.stringify(Object.keys(fields).map(k => query[keyFor(k)] ?? null))
  let lastWritten: string | undefined
  let restoring = false
  let disposed = false

  function restore() {
    restoring = true
    for (const [key, field] of Object.entries(fields)) {
      const raw = route.query[keyFor(key)]
      const fallback = defaults[key]
      let value: unknown = clone(fallback)
      if (raw != null) {
        if (Array.isArray(fallback)) value = (Array.isArray(raw) ? raw : [raw]).map(v => v ?? '')
        else if (typeof fallback === 'number') {
          const n = Number(raw)
          if (!Array.isArray(raw) && Number.isFinite(n) &&
              (!['page', 'pageSize'].includes(key) || (Number.isInteger(n) && n > 0 && (key !== 'pageSize' || n <= 100)))) value = n
        } else if (typeof fallback === 'boolean') value = raw === 'true'
        else if (!Array.isArray(raw)) value = raw
      }
      field.set(value)
    }
    restoring = false
  }

  function syncQuery() {
    if (restoring || disposed || route.path !== path) return
    const query: LocationQueryRaw = { ...route.query }
    for (const [key, field] of Object.entries(fields)) {
      const value = field.get()
      const name = keyFor(key)
      if (value == null || JSON.stringify(value) === JSON.stringify(defaults[key])) delete query[name]
      else query[name] = Array.isArray(value) ? value.map(String) : String(value)
    }
    const next = signature(query)
    if (next === signature(route.query)) return
    lastWritten = next
    void router.replace({ path, query }).catch(() => { lastWritten = undefined })
  }

  restore()
  watch(() => route.query, (nextQuery, previousQuery) => {
    if (route.path !== path || disposed || signature(nextQuery) === signature(previousQuery)) return
    const next = signature(nextQuery)
    if (next === lastWritten) { lastWritten = undefined; return }
    const before = JSON.stringify(snapshot())
    restore()
    if (before !== JSON.stringify(snapshot())) void reload?.()
  })
  if (options.live) watch(snapshot, syncQuery, { deep: true, flush: 'post' })
  onScopeDispose(() => { disposed = true })
  return { syncQuery }
}
