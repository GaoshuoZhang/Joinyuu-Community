import type { ApplicationCreatePayload, ApplicationFormSchema, ApplicationType, MyApplication, UploadedFileInfo } from '@/types'
import { applicationFormSchemas, applicationsByUid, nowStamp, pushNotice } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 申请 handlers：settle 企业入驻 / cooperation 合作伙伴 / individual 人才登记（schema 驱动）
 * 与 identity 身份绑定。表单自定义字段与附件上传为缺口 §7.1-14 / §7.1-6。 */

const TYPE_LABEL: Record<ApplicationType, string> = {
  settle: '企业入驻',
  individual: '人才登记',
  cooperation: '合作伙伴',
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

/** 按申请类型下发表单 schema（缺口 §7.1-14：接入期由后端/运营配置驱动） */
export async function fetchFormSchema(type: ApplicationType): Promise<ApplicationFormSchema> {
  return withLatency(() => {
    const schema = applicationFormSchemas[type]
    if (!schema) fail(404, '该申请类型暂不支持自助表单')
    return schema
  }, 160)
}

function isAttachmentList(value: unknown): value is UploadedFileInfo[] {
  return Array.isArray(value) && value.every((v) => !!v && typeof v === 'object' && 'name' in (v as object))
}

export async function createApplication(payload: ApplicationCreatePayload): Promise<{ id: string }> {
  return withLatency(() => {
    const uid = requireUid()
    const label = TYPE_LABEL[payload.type]
    if (!label) fail(400, '申请类型无效')

    const schema = applicationFormSchemas[payload.type]
    let targetName = payload.organizationName?.trim() ?? label
    let summary: string | undefined
    let attachments: { name: string; size: number }[] = []

    if (schema) {
      /* schema 驱动：逐字段校验必填并生成摘要/附件清单 */
      const fields = payload.fields ?? {}
      const parts: string[] = []
      for (const field of schema.fields) {
        const value = fields[field.key]
        if (field.type === 'upload') {
          const list = isAttachmentList(value) ? value : []
          if (field.required && list.length === 0) fail(400, `请上传${field.label}`)
          attachments = attachments.concat(list.map((a) => ({ name: a.name, size: a.size })))
          continue
        }
        const text = value === undefined || value === null ? '' : String(value).trim()
        if (field.required && !text) fail(400, `请填写${field.label}`)
        if (text) parts.push(`${field.label}：${text}`)
      }
      summary = parts.slice(0, 3).join(' · ')
      const nameField = schema.fields.find((f) => ['companyName', 'orgName', 'realName'].includes(f.key))
      const nameValue = nameField ? String(fields[nameField.key] ?? '').trim() : ''
      targetName = nameValue || label
    } else if (payload.type === 'identity') {
      if (!payload.identityType) fail(400, '请选择要绑定的身份类型')
      targetName = `${payload.identityType === 'community_enterprise' ? '社区企业' : '社区个体'} 身份绑定`
    }

    const mine = (applicationsByUid[uid] ??= [])
    if (mine.some((a) => a.type === payload.type && a.status === 'pending')) fail(409, '你已有同类型申请在审核中，请耐心等待')
    const id = `AP${Date.now()}`
    mine.unshift({
      id,
      type: payload.type,
      targetName,
      status: 'pending',
      submittedAt: nowStamp(),
      summary,
      attachments: attachments.length ? attachments : undefined,
    })
    /* [MOCK-ONLY] 通知触发点：申请已提交（审核结果通知由管理端审核动作产生） */
    pushNotice(uid, { type: 'system', title: `${label}申请已提交`, content: '申请已提交至「申请审核」，审核结果将通过站内信通知你。', link: '/me/applications' })
    return { id }
  })
}
