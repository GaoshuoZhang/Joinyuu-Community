import { beforeEach, describe, expect, it } from 'vitest'
import { fetchMyApplication } from './handlers/applications'
import { fetchMyArticle } from './handlers/contents'
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
})
