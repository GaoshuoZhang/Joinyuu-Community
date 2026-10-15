import { describe, expect, it } from 'vitest'
import { activeRespondedDemandIds } from './demandResponses'

describe('activeRespondedDemandIds', () => {
  it('excludes withdrawn responses from the responded markers', () => {
    const ids = activeRespondedDemandIds([
      { id: '1', demandId: 'demand-active', demandTitle: '需求一', note: '', at: '2026-10-15' },
      { id: '2', demandId: 'demand-withdrawn', demandTitle: '需求二', note: '', at: '2026-10-14', withdrawnAt: '2026-10-15' },
    ])

    expect(ids).toEqual(new Set(['demand-active']))
  })
})
