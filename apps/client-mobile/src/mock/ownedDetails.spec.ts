import { beforeEach, describe, expect, it } from 'vitest'
import { fetchMyApplication } from './handlers/applications'
import { fetchMyArticle } from './handlers/contents'
import { fetchMyOrder, fetchMyOrders } from './handlers/mall'
import { issueToken } from './session'

describe('mock owned record details', () => {
  beforeEach(() => {
    localStorage.clear()
    issueToken('U1001', [{ type: 'community_individual' }])
  })

  it('returns normalized application fields and timeline to the owner', async () => {
    await expect(fetchMyApplication('AP3001')).resolves.toMatchObject({
      id: 'AP3001',
      fields: expect.arrayContaining([expect.objectContaining({ key: 'skills', label: '擅长领域' })]),
      records: expect.arrayContaining([expect.objectContaining({ action: 'approve' })]),
    })
  })

  it('returns stored submitted article content to the owner', async () => {
    await expect(fetchMyArticle('SU1002')).resolves.toMatchObject({
      id: 'SU1002',
      status: 'rejected',
      content: expect.stringContaining('需求澄清'),
    })
  })

  it('does not expose either record to another member', async () => {
    issueToken('U1004', [{ type: 'community_enterprise', enterpriseId: 'E9001' }])
    await expect(fetchMyApplication('AP3001')).rejects.toEqual(expect.objectContaining({ code: 404 }))
    await expect(fetchMyArticle('SU1002')).rejects.toEqual(expect.objectContaining({ code: 404 }))
  })

  it('returns the order detail with the same shape as the list item, including expired derivation', async () => {
    const detail = await fetchMyOrder('RO2002')
    expect(detail).toMatchObject({ id: 'RO2002', goodsName: '精品咖啡券（单杯）', voucherCode: 'JYV-DEMO01' })
    const list = await fetchMyOrders({ pageSize: 100 })
    expect(detail).toEqual(list.list.find((order) => order.id === 'RO2002'))
    /* 过期券码与列表口径一致：RO2006 有效期已过 → expired */
    await expect(fetchMyOrder('RO2006')).resolves.toMatchObject({ id: 'RO2006', status: 'expired' })
  })

  it('scopes the order detail to its owner', async () => {
    await expect(fetchMyOrder('RO2010')).rejects.toEqual(expect.objectContaining({ code: 404 }))
    await expect(fetchMyOrder('RO9999')).rejects.toEqual(expect.objectContaining({ code: 404 }))
    issueToken('U1004', [{ type: 'community_enterprise', enterpriseId: 'E9001' }])
    await expect(fetchMyOrder('RO2010')).resolves.toMatchObject({ id: 'RO2010', fulfillment: 'physical' })
    await expect(fetchMyOrder('RO2002')).rejects.toEqual(expect.objectContaining({ code: 404 }))
  })
})
