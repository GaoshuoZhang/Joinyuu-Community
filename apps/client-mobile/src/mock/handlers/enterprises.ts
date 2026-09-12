import type { EnterpriseShowcase } from '@/types'
import { enterprises, pushNotice } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 企业展示页 handlers：published 才可见；展示页申请联动 showcaseStatus（演示全链路）。 */

export async function fetchEnterpriseShowcase(id: string): Promise<EnterpriseShowcase> {
  return withLatency(() => {
    const e = enterprises.find((x) => x.id === id)
    if (!e || e.showcaseStatus !== 'published') fail(404, '企业展示页不存在或未发布')
    return {
      id: e.id, name: e.name, industry: e.industry, size: e.size,
      description: e.description, showcaseStatus: e.showcaseStatus, members: [...e.members],
    }
  })
}

export async function createShowcaseRequest(enterpriseId: string, note: string): Promise<void> {
  await withLatency(() => {
    const payload = readPayload()
    if (!payload) fail(401, '未登录或登录已过期')
    if (!note.trim()) fail(400, '请输入申请说明')
    const e = enterprises.find((x) => x.id === enterpriseId)
    if (!e) fail(404, '企业不存在')
    /* [MOCK-ONLY] 演示全链路：申请提交 → 立即通过并发布（真实后端为管理端审核联动） */
    e.showcaseStatus = 'published'
    pushNotice(payload.sub, {
      type: 'audit_result',
      title: '展示页发布申请已通过',
      content: `「${e.name}」企业展示页已发布，可在客户端查看。`,
      link: `/enterprises/${e.id}`,
    })
  })
}
