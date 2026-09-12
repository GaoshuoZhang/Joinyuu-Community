import type { ApplicationCreatePayload, MyApplication } from '@/types'
import { applicationsByUid, pushNotice } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 申请 handlers：settle 企业入驻 / individual 个体入驻 / cooperation 企业合作 / identity 身份绑定。 */

const TYPE_LABEL: Record<ApplicationCreatePayload['type'], string> = {
  settle: '企业入驻',
  individual: '社区个体入驻',
  cooperation: '企业合作',
  identity: '身份绑定',
}

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchMyApplications(): Promise<MyApplication[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(applicationsByUid[uid] ?? [])]
  })
}

export async function createApplication(payload: ApplicationCreatePayload): Promise<{ id: string }> {
  return withLatency(() => {
    const uid = requireUid()
    const label = TYPE_LABEL[payload.type]
    if (!label) fail(400, '申请类型无效')
    if (payload.type === 'cooperation' && !payload.organizationName?.trim()) fail(400, '请填写企业名称')
    if (payload.type === 'identity' && !payload.identityType) fail(400, '请选择要绑定的身份类型')
    const targetName = payload.organizationName?.trim()
      ?? (payload.type === 'identity' ? `${payload.identityType} 身份绑定` : label)
    const mine = (applicationsByUid[uid] ??= [])
    if (mine.some((a) => a.type === payload.type && a.status === 'pending')) fail(409, '你已有同类型申请在审核中，请耐心等待')
    const id = `AP${Date.now()}`
    mine.unshift({ id, type: payload.type, targetName, status: 'pending', submittedAt: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16) })
    /* [MOCK-ONLY] 通知触发点：申请已提交（审核结果通知由管理端审核动作产生） */
    pushNotice(uid, { type: 'system', title: `${label}申请已提交`, content: '申请已提交至「申请审核」，审核结果将通过站内信通知你。', link: '/me/applications' })
    return { id }
  })
}
