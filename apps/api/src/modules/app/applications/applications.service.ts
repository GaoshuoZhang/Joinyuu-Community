import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Application, Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import type { CreateApplicationDto } from './dto/create-application.dto'

/** 申请类型（对齐客户端 ApplicationType：settle/cooperation/individual） */
export type AppApplicationType = 'settle' | 'cooperation' | 'individual'

export interface ApplicationField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'upload'
  required?: boolean
  placeholder?: string
  help?: string
  maxlength?: number
  options?: { label: string; value: string }[]
  accept?: string
  multiple?: boolean
  maxCount?: number
}

export interface ApplicationFormSchemaDto {
  type: AppApplicationType
  title: string
  subtitle: string
  submitLabel: string
  tips?: string[]
  fields: ApplicationField[]
}

/** 我的申请 DTO（对齐客户端 MyApplication） */
export interface MyApplicationDto {
  id: string
  type: string
  targetName: string
  status: string
  submittedAt: string
  summary?: string
  attachments?: { name: string; size: number }[]
  rejectReason?: string
  reviewedAt?: string
  records: ApplicationTimelineDto[]
}

export interface ApplicationDetailFieldDto {
  key?: string
  label: string
  value?: string
  files?: { name: string; size?: number; url?: string }[]
}

export interface ApplicationTimelineDto {
  at: string
  action: string
  title: string
  text?: string
  operator?: string
}

export interface MyApplicationDetailDto extends MyApplicationDto {
  fields: ApplicationDetailFieldDto[]
  note?: string
}

const TYPE_LABEL: Record<AppApplicationType, string> = {
  settle: '企业入驻',
  cooperation: '合作伙伴',
  individual: '人才登记',
}

const INDUSTRY_OPTIONS = [
  '互联网/软件', '智能制造', '生物医药', '新能源', '文化创意', '金融服务',
  '专业服务', '教育科研', '商贸流通', '其他',
].map((v) => ({ label: v, value: v }))

export const DEFAULT_APPLICATION_SCHEMAS: Record<AppApplicationType, ApplicationFormSchemaDto> = {
  settle: {
    type: 'settle',
    title: '企业入驻申请',
    subtitle: '提交资料并通过审核后，成为「社区企业」并获得办公空间',
    submitLabel: '提交入驻申请',
    tips: ['企业入驻需在社区拥有办公空间（办公位或独立办公室）', '请准备营业执照；审核约 3 个工作日，结果站内信通知'],
    fields: [
      { key: 'companyName', label: '企业名称', type: 'text', required: true, placeholder: '与营业执照一致', maxlength: 60 },
      { key: 'creditCode', label: '统一社会信用代码', type: 'text', required: true, placeholder: '18 位统一社会信用代码', maxlength: 18 },
      { key: 'industry', label: '所属行业', type: 'select', required: true, options: INDUSTRY_OPTIONS },
      { key: 'companySize', label: '团队规模', type: 'select', required: true, options: [
        { label: '1-9 人', value: '1-9 人' },
        { label: '10-49 人', value: '10-49 人' },
        { label: '50-99 人', value: '50-99 人' },
        { label: '100 人以上', value: '100 人以上' },
      ] },
      { key: 'officeNeeds', label: '办公空间需求', type: 'select', required: true, help: '企业入驻需在社区拥有办公空间', options: [
        { label: '1-2 个办公位', value: '1-2 个办公位' },
        { label: '3-6 个办公位', value: '3-6 个办公位' },
        { label: '独立办公室', value: '独立办公室' },
        { label: '其他（在简介中说明）', value: '其他' },
      ] },
      { key: 'settleDate', label: '预计入驻时间', type: 'date', required: true },
      { key: 'contactName', label: '联系人', type: 'text', required: true, maxlength: 20 },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, placeholder: '11 位手机号', maxlength: 11 },
      { key: 'intro', label: '企业简介与主营业务', type: 'textarea', required: true, maxlength: 500, placeholder: '简要介绍业务方向、核心产品与入驻诉求…' },
      { key: 'businessLicense', label: '营业执照', type: 'upload', required: true, accept: 'image/*,application/pdf', help: '支持 JPG/PNG/PDF，单个文件 ≤10MB' },
      { key: 'extraFiles', label: '其他补充材料', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 3, help: '选填，最多 3 个文件' },
    ],
  },
  cooperation: {
    type: 'cooperation',
    title: '合作伙伴申请',
    subtitle: '无需入驻办公，审核通过后成为「合作企业」',
    submitLabel: '提交合作申请',
    tips: ['适合投资机构、服务机构、高校院所等', '审核通过后开通企业名片申请与项目对接'],
    fields: [
      { key: 'orgName', label: '机构名称', type: 'text', required: true, maxlength: 60 },
      { key: 'orgType', label: '机构类型', type: 'select', required: true, options: [
        { label: '企业', value: '企业' },
        { label: '投资机构', value: '投资机构' },
        { label: '高校院所', value: '高校院所' },
        { label: '服务机构', value: '服务机构' },
        { label: '其他', value: '其他' },
      ] },
      { key: 'coopField', label: '合作领域与方式', type: 'textarea', required: true, maxlength: 300, placeholder: '希望在哪些领域、以什么方式与社区及社区企业合作…' },
      { key: 'resources', label: '可提供的资源', type: 'textarea', maxlength: 200, placeholder: '选填：资金、渠道、服务能力等' },
      { key: 'contactName', label: '联系人', type: 'text', required: true, maxlength: 20 },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, maxlength: 11 },
      { key: 'attachments', label: '资质或案例材料', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 3, help: '选填，最多 3 个文件' },
    ],
  },
  individual: {
    type: 'individual',
    title: '人才登记',
    subtitle: '登记个人专长，审核通过后成为「社区个体」',
    submitLabel: '提交人才登记',
    tips: ['审核通过后进入社区人才库，可被社区企业按需检索与对接', '登记即代表同意社区向入驻企业展示你的专长信息'],
    fields: [
      { key: 'realName', label: '真实姓名', type: 'text', required: true, maxlength: 20 },
      { key: 'skills', label: '擅长领域', type: 'text', required: true, placeholder: '如：产品设计 / 前端开发 / 法务财税', maxlength: 40 },
      { key: 'years', label: '从业年限', type: 'number', required: true, placeholder: '如：5' },
      { key: 'intro', label: '个人简介', type: 'textarea', required: true, maxlength: 300, placeholder: '介绍你的经验、代表项目与可提供的帮助…' },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, maxlength: 11 },
      { key: 'portfolio', label: '作品集或简历', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 2, help: '选填，最多 2 个文件' },
    ],
  },
}

/** 存储于 Application.details 的载荷包装（供 payload 回填） */
export interface ApplicationPayloadStorage {
  fields: Record<string, unknown>
  note?: string
}

/** 判定 upload 字段值是否为附件数组 */
function isAttachmentList(value: unknown): value is { name: string; size: number; url?: string }[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false
    const file = item as Record<string, unknown>
    return typeof file.name === 'string' && !!file.name.trim()
      && typeof file.size === 'number' && Number.isFinite(file.size) && file.size >= 0
  })
}

/* 申请（M2-R R2 /api/app/applications）：
 * 可配置表单 schema 下发（未配置时使用冻结默认值）、schema 驱动提交（写 Application + records 时间线）、
 * 我的申请、撤回（pending→withdrawn）、修改重提（rejected/withdrawn→pending）、回填 payload。
 * 从简：Application 无 userId 列，以 applicantPhone（用户手机号）识别「我的申请」。 */
@Injectable()
export class AppApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
  ) {}

  /** 表单 schema 下发 */
  async formSchema(type: string): Promise<ApplicationFormSchemaDto> {
    const configured = await this.prisma.applicationFormConfig.findUnique({ where: { type } })
    if (configured) {
      return {
        type: configured.type as AppApplicationType,
        title: configured.title,
        subtitle: configured.subtitle,
        submitLabel: configured.submitLabel,
        tips: configured.tips as string[],
        fields: configured.fields as unknown as ApplicationField[],
      }
    }
    const schema = DEFAULT_APPLICATION_SCHEMAS[type as AppApplicationType]
    if (!schema) throw new NotFoundException('该申请类型暂不支持自助表单')
    return schema
  }

  /** 提交申请（schema 校验必填 + targetName/summary/attachments 派生 + 同类型 pending 去重） */
  async create(user: { uid: string; name: string }, dto: CreateApplicationDto): Promise<{ id: string }> {
    const account = await this.prisma.user.findUnique({ where: { uid: user.uid } })
    const phone = account?.phone ?? ''
    const name = account?.nickname || user.name
    const type = dto.type
    if (type === 'individual' && (!account?.realName || !account.citizenId)) {
      throw new ForbiddenException('完成实名认证后才能提交人才登记')
    }
    const schema = await this.formSchema(type)
    if (!schema) throw new BadRequestException('申请类型无效')

    const fields = dto.fields ?? {}
    const { targetName, summary } = await this.normalize(type as AppApplicationType, fields)

    /* 同类型审核中申请去重 */
    const dup = await this.prisma.application.findFirst({
      where: { type, status: 'pending', deletedAt: null, applicantPhone: phone },
    })
    if (dup) throw new ConflictException('你已有同类型申请在审核中，请耐心等待')

    const now = formatNow()
    const payload: ApplicationPayloadStorage = { fields, note: dto.note }
    const application = await this.prisma.application.create({
      data: {
        id: await this.ids.next('AP'),
        type,
        applicantName: name,
        applicantPhone: phone,
        targetName,
        summary: summary ?? '',
        details: payload as unknown as Prisma.InputJsonValue,
        records: [{ at: now, action: 'submit', text: `${TYPE_LABEL[type as AppApplicationType]}「${targetName}」已提交，待审核` }],
        status: 'pending',
        submittedAt: now,
      },
    })

    await this.notify.pushNotice(user.uid, {
      type: 'audit_result',
      title: `${TYPE_LABEL[type as AppApplicationType]}申请已提交`,
      content: `「${targetName}」已提交审核，结果将通过站内信通知你。`,
      link: '/me/applications',
    })
    return { id: application.id }
  }

  /** 我的申请（含时间线 records 与状态） */
  async myApplications(uid: string): Promise<MyApplicationDto[]> {
    const phone = await this.phoneOf(uid)
    const rows = await this.prisma.application.findMany({
      where: { applicantPhone: phone, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
    })
    return rows.map(toMyApplicationDto)
  }

  /** 申请详情：手机号归属校验，兼容历史数组、平铺对象和新版 fields 包装。 */
  async detail(uid: string, id: string): Promise<MyApplicationDetailDto> {
    const phone = await this.phoneOf(uid)
    const application = await this.mine(phone, id)
    const configured = await this.prisma.applicationFormConfig.findUnique({ where: { type: application.type } })
    const schemaFields = configured
      ? configured.fields as unknown as ApplicationField[]
      : DEFAULT_APPLICATION_SCHEMAS[application.type as AppApplicationType]?.fields ?? []
    const stored = readStored(application)
    const dto: MyApplicationDetailDto = {
      ...toMyApplicationDto(application),
      fields: toApplicationFields(application.details, schemaFields),
    }
    if (stored.note) dto.note = stored.note
    return dto
  }

  /** 撤回审核中的申请：pending → withdrawn */
  async withdraw(uid: string, id: string): Promise<{ code: number }> {
    const phone = await this.phoneOf(uid)
    const application = await this.mine(phone, id)
    if (application.status !== 'pending') throw new ConflictException('仅审核中的申请可撤回')
    const records = (application.records as Prisma.JsonArray) ?? []
    await this.prisma.application.update({
      where: { id },
      data: {
        status: 'withdrawn',
        records: [...records, { at: formatNow(), action: 'withdraw', text: `申请人撤回「${application.targetName}」` }],
      },
    })
    await this.notify.pushNotice(uid, {
      type: 'audit_result',
      title: '申请已撤回',
      content: `「${application.targetName}」已撤回，可修改后重新提交。`,
      link: '/me/applications',
    })
    return { code: 0 }
  }

  /** 修改重提：rejected/withdrawn → pending（可带新 fields 覆盖 details） */
  async resubmit(uid: string, id: string, dto: CreateApplicationDto): Promise<{ code: number }> {
    const phone = await this.phoneOf(uid)
    const application = await this.mine(phone, id)
    if (application.status !== 'rejected' && application.status !== 'withdrawn') {
      throw new ConflictException('仅已驳回或已撤回的申请可修改重提')
    }
    if (application.type === 'individual') await this.assertTalentApplicantVerified(uid)
    const schema = await this.formSchema(application.type)
    if (!schema) throw new BadRequestException('申请类型无效')
    const fields = dto.fields ?? (application.details as unknown as ApplicationPayloadStorage | null)?.fields ?? {}
    const { targetName, summary } = await this.normalize(application.type as AppApplicationType, fields)
    const payload: ApplicationPayloadStorage = { fields, note: dto.note }
    const now = formatNow()
    const records = (application.records as Prisma.JsonArray) ?? []
    await this.prisma.application.update({
      where: { id },
      data: {
        targetName,
        summary: summary ?? '',
        details: payload as unknown as Prisma.InputJsonValue,
        status: 'pending',
        submittedAt: now,
        records: [...records, { at: now, action: 'resubmit', text: `「${targetName}」已重新提交审核` }],
      },
    })
    await this.notify.pushNotice(uid, {
      type: 'audit_result',
      title: '申请已重新提交',
      content: `「${targetName}」已重新提交审核。`,
      link: '/me/applications',
    })
    return { code: 0 }
  }

  /** 回填申请原始载荷（仅本人） */
  async payload(uid: string, id: string): Promise<CreateApplicationDto> {
    const phone = await this.phoneOf(uid)
    const application = await this.mine(phone, id)
    const stored = readStored(application)
    const dto: CreateApplicationDto = { type: application.type }
    if (stored.fields) dto.fields = stored.fields
    if (stored.note) dto.note = stored.note
    return dto
  }

  /* ---------- 私有辅助 ---------- */

  private async phoneOf(uid: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { uid }, select: { phone: true } })
    return user?.phone ?? ''
  }

  private async assertTalentApplicantVerified(uid: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { uid }, select: { realName: true, citizenId: true } })
    if (!user?.realName || !user.citizenId) throw new ForbiddenException('完成实名认证后才能提交人才登记')
  }

  private async mine(phone: string, id: string): Promise<Application> {
    const application = await this.prisma.application.findFirst({
      where: { id, applicantPhone: phone, deletedAt: null },
    })
    if (!application) throw new NotFoundException('申请不存在')
    return application
  }

  private async normalize(
    type: AppApplicationType,
    fields: Record<string, unknown>,
  ): Promise<{ targetName: string; summary?: string; attachments: { name: string; size: number }[] }> {
    const label = TYPE_LABEL[type]
    const configured = await this.prisma.applicationFormConfig.findUnique({ where: { type } })
    const schema = configured
      ? {
          type,
          title: configured.title,
          subtitle: configured.subtitle,
          submitLabel: configured.submitLabel,
          tips: configured.tips as string[],
          fields: configured.fields as unknown as ApplicationField[],
        }
      : DEFAULT_APPLICATION_SCHEMAS[type]
    const parts: string[] = []
    const attachments: { name: string; size: number }[] = []

    for (const field of schema.fields) {
      const value = fields[field.key]
      if (field.type === 'upload') {
        const list = isAttachmentList(value) ? value : []
        if (value !== undefined && !isAttachmentList(value)) throw new BadRequestException(`${field.label}的附件数据无效`)
        if (field.required && list.length === 0) throw new BadRequestException(`请上传${field.label}`)
        const maxCount = field.multiple === true ? (field.maxCount ?? 20) : 1
        if (list.length > maxCount) throw new BadRequestException(`${field.label}最多上传 ${maxCount} 个文件`)
        attachments.push(...list.map((a) => ({ name: a.name, size: a.size })))
        continue
      }
      const text = value === undefined || value === null ? '' : String(value).trim()
      if (field.required && !text) throw new BadRequestException(`请填写${field.label}`)
      if (field.maxlength && text.length > field.maxlength) throw new BadRequestException(`${field.label}不能超过 ${field.maxlength} 字`)
      if (field.type === 'number' && text && !Number.isFinite(Number(text))) throw new BadRequestException(`${field.label}必须是有效数字`)
      if (field.type === 'select' && text && !field.options?.some((option) => option.value === text)) throw new BadRequestException(`${field.label}的选项无效`)
      if (text) parts.push(`${field.label}：${text}`)
    }

    const nameField = schema.fields.find((f) => ['companyName', 'orgName', 'realName'].includes(f.key))
    const nameValue = nameField ? String(fields[nameField.key] ?? '').trim() : ''
    const targetName = nameValue || label
    const summary = parts.slice(0, 3).join(' · ')

    return { targetName, summary, attachments }
  }
}

function toMyApplicationDto(a: Application): MyApplicationDto {
  const stored = readStored(a)
  const attachments: { name: string; size: number }[] = []
  if (stored.fields) {
    for (const value of Object.values(stored.fields)) {
      if (isAttachmentList(value)) attachments.push(...value.map((v) => ({ name: v.name, size: v.size })))
    }
  }
  const records = toApplicationTimeline(a.records)
  const review = [...records].reverse().find((record) => record.action === 'approve' || record.action === 'reject')
  const dto: MyApplicationDto = {
    id: a.id,
    type: a.type,
    targetName: a.targetName,
    status: a.status,
    submittedAt: a.submittedAt,
    records,
  }
  if (a.summary) dto.summary = a.summary
  if (attachments.length) dto.attachments = attachments
  if (review) dto.reviewedAt = review.at
  if (a.status === 'rejected' && review?.text) dto.rejectReason = review.text
  return dto
}

/** 读取 Application.details 为标准化载荷（兼容新版包装和平铺对象旧数据）。 */
function readStored(a: Application): ApplicationPayloadStorage {
  const raw = a.details
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const object = raw as Record<string, unknown>
    const fields = object.fields && typeof object.fields === 'object' && !Array.isArray(object.fields)
      ? object.fields as Record<string, unknown>
      : Object.fromEntries(Object.entries(object).filter(([key]) => key !== 'note'))
    return {
      fields,
      ...(typeof object.note === 'string' && object.note.trim() ? { note: object.note } : {}),
    }
  }
  return {} as ApplicationPayloadStorage
}

function toApplicationFields(raw: Prisma.JsonValue, schemaFields: ApplicationField[]): ApplicationDetailFieldDto[] {
  if (Array.isArray(raw)) {
    const legacyEntries: ApplicationDetailFieldDto[] = []
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const item = entry as Record<string, unknown>
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      if (!label) continue
      if (Array.isArray(item.files)) {
        const files = item.files.flatMap((file) => {
          if (!file || typeof file !== 'object' || Array.isArray(file)) return []
          const data = file as Record<string, unknown>
          if (typeof data.name !== 'string' || !data.name.trim()) return []
          return [{
            name: data.name,
            ...(typeof data.size === 'number' ? { size: data.size } : {}),
            ...(typeof data.url === 'string' && data.url ? { url: data.url } : {}),
          }]
        })
        legacyEntries.push({ label, files })
        continue
      }
      const value = item.value == null ? '' : String(item.value)
      legacyEntries.push({ label, ...(value ? { value } : {}) })
    }
    return legacyEntries
  }
  if (!raw || typeof raw !== 'object') return []
  const object = raw as Record<string, unknown>
  const fields = object.fields && typeof object.fields === 'object' && !Array.isArray(object.fields)
    ? object.fields as Record<string, unknown>
    : Object.fromEntries(Object.entries(object).filter(([key]) => key !== 'note'))
  const labels = new Map(schemaFields.map((field) => [field.key, field.label]))
  const entries: ApplicationDetailFieldDto[] = []
  for (const [key, value] of Object.entries(fields)) {
    const label = labels.get(key) ?? key
    if (isAttachmentList(value)) {
      entries.push({
        key,
        label,
        files: value.map((file) => ({
          name: file.name,
          size: file.size,
          ...(file.url ? { url: file.url } : {}),
        })),
      })
      continue
    }
    if (value == null || value === '') continue
    entries.push({ key, label, value: Array.isArray(value) ? value.map(String).join('、') : String(value) })
  }
  return entries
}

function toApplicationTimeline(raw: Prisma.JsonValue): ApplicationTimelineDto[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const at = typeof record.at === 'string' ? record.at : ''
    const action = typeof record.action === 'string' ? record.action : 'update'
    const step = typeof record.step === 'string' ? record.step : ''
    const text = typeof record.comment === 'string' && record.comment.trim()
      ? record.comment.trim()
      : typeof record.text === 'string' && record.text.trim() ? record.text.trim() : undefined
    const operator = typeof record.operator === 'string' && record.operator.trim() ? record.operator.trim() : undefined
    return [{
      at,
      action,
      title: step || (action === 'submit' ? '提交申请' : action === 'resubmit' ? '重新提交' : action === 'withdraw' ? '撤回申请' : action === 'approve' ? '审核通过' : action === 'reject' ? '审核驳回' : '状态更新'),
      ...(text ? { text } : {}),
      ...(operator ? { operator } : {}),
    }]
  })
}
