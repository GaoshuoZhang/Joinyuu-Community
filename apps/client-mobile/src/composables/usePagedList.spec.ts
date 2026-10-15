import { describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { usePagedList } from './usePagedList'

describe('usePagedList', () => {
  it('总数不变时追加最后一页也能更新列表和结束状态', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ list: [{ id: '1' }], total: 2 })
      .mockResolvedValueOnce({ list: [{ id: '2' }], total: 2 })
    const list = usePagedList<{ id: string }>(fetch, 1)
    const ids = computed(() => list.items.value.map((item) => item.id))
    await list.refresh()
    expect(ids.value).toEqual(['1'])
    expect(list.hasMore.value).toBe(true)
    await list.loadMore()
    expect(ids.value).toEqual(['1', '2'])
    expect(list.hasMore.value).toBe(false)
    await list.loadMore()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
