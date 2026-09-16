import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Application, Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import type { CreateApplicationDto } from './dto/create-application.dto'

/** 申请类型（对齐客户端 ApplicationType：settle/cooperation/individual/identity） */
export type AppApplicationType = 'settle' | 'cooperation' | 'individual' | 'identity'

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
  records: Prisma.JsonArray
}

const TYPE_LABEL: Record<AppApplicationType, string> = {
  settle: '企业入驻',
  cooperation: '合作伙伴',
  individual: '人才登记',
  identity: '身份绑定',
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
    tips: ['企业入驻需在社区拥有办公空间（工位或独立办公室）', '请准备营业执照；审核约 3 个工作日，结果站内信通知'],
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
        { label: '1-2 个工位', value: '1-2 个工位' },
        { label: '3-6 个工位', value: '3-6 个工位' },
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
  identity: {
    type: 'identity',
    title: '身份绑定',
    subtitle: '加入社区生态：绑定社区个体或社区企业身份',
    submitLabel: '提交身份绑定',
    tips: ['社区个体：面向个人专长展示', '社区企业：需填写要绑定并已在社区入驻的企业名称'],
    fields: [
      { key: 'identityType', label: '要绑定的身份', type: 'select', required: true, options: [
        { label: '社区个体', value: 'community_individual' },
        { label: '社区企业', value: 'community_enterprise' },
      ] },
      { key: 'orgName', label: '社区企业名称', type: 'text', maxlength: 60, help: '选择社区企业身份时填写' },
      { key: 'industry', label: '所属行业', type: 'select', options: INDUSTRY_OPTIONS },
      { key: 'contactName', label: '联系人', type: 'text', required: true, maxlength: 20 },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, maxlength: 11 },
      { key: 'certifications', label: '相关材料', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 3, help: '选填，最多 3 个文件' },
    ],
  },
}

/** 存储于 Application.details 的载荷包装（供 payload 回填） */
export interface ApplicationPayloadStorage {
  fields: Record<string, unknown>
  identityType?: string
  organizationName?: string
  note?: string
}

/** 判定 upload 字段值是否为附件数组 */
function isAttachmentList(value: unknown): value is { name: string; size: number; url?: string }[] {
  return Array.isArray(value) && value.every((v) => !!v && typeof v === 'object' && 'name' in (v as object))
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
    const schema = await this.formSchema(type)
    if (!schema) throw new BadRequestException('申请类型无效')

    const fields = dto.fields ?? {}
    const { targetName, summary } = await this.normalize(type as AppApplicationType, fields, dto)

    /* 同类型审核中申请去重 */
    const dup = await this.prisma.application.findFirst({
      where: { type, status: 'pending', deletedAt: null, applicantPhone: phone },
    })
    if (dup) throw new ConflictException('你已有同类型申请在审核中，请耐心等待')

    const now = formatNow()
    const payload: ApplicationPayloadStorage = { fields, identityType: dto.identityType, organizationName: dto.organizationName, note: dto.note }
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
    const schema = await this.formSchema(application.type)
    if (!schema) throw new BadRequestException('申请类型无效')
    const fields = dto.fields ?? (application.details as unknown as ApplicationPayloadStorage | null)?.fields ?? {}
    const { targetName, summary } = await this.normalize(application.type as AppApplicationType, fields, dto)
    const payload: ApplicationPayloadStorage = { fields, identityType: dto.identityType, organizationName: dto.organizationName, note: dto.note }
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
    if (stored.identityType) dto.identityType = stored.identityType
    if (stored.organizationName) dto.organizationName = stored.organizationName
    if (stored.note) dto.note = stored.note
    return dto
  }

  /* ---------- 私有辅助 ---------- */

  private async phoneOf(uid: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { uid }, select: { phone: true } })
    return user?.phone ?? ''
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
    dto: CreateApplicationDto,
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
        if (field.required && list.length === 0) throw new BadRequestException(`请上传${field.label}`)
        attachments.push(...list.map((a) => ({ name: a.name, size: a.size })))
        continue
      }
      const text = value === undefined || value === null ? '' : String(value).trim()
      if (field.required && !text) throw new BadRequestException(`请填写${field.label}`)
      if (text) parts.push(`${field.label}：${text}`)
    }

    if (type === 'identity') {
      const bindType = dto.identityType ?? String(fields.identityType ?? '')
      if (bindType !== 'community_individual' && bindType !== 'community_enterprise') {
        throw new BadRequestException('请选择要绑定的身份类型')
      }
      if (bindType === 'community_enterprise' && !dto.organizationName?.trim()) {
        throw new BadRequestException('请填写要绑定的社区企业名称')
      }
    }

    const nameField = schema.fields.find((f) => ['companyName', 'orgName', 'realName'].includes(f.key))
    const nameValue = nameField ? String(fields[nameField.key] ?? '').trim() : ''
    const targetName = nameValue || dto.organizationName?.trim() || label
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
  const dto: MyApplicationDto = {
    id: a.id,
    type: a.type,
    targetName: a.targetName,
    status: a.status,
    submittedAt: a.submittedAt,
    records: (a.records as Prisma.JsonArray) ?? [],
  }
  if (a.summary) dto.summary = a.summary
  if (attachments.length) dto.attachments = attachments
  return dto
}

/** 读取 Application.details 为标准化载荷（容错非对象/数组旧数据） */
function readStored(a: Application): ApplicationPayloadStorage {
  const raw = a.details
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as unknown as ApplicationPayloadStorage
  return {} as ApplicationPayloadStorage
}
