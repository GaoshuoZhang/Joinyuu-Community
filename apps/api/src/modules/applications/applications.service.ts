import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { RedisService } from '../../common/redis/redis.service'
import { NotificationService } from '../../common/notify/notification.service'
import { CACHE_KEYS } from '../../common/redis/cache-keys'
import { formatNow, formatToday } from '../../common/utils/time'
import { DEFAULT_APPLICATION_SCHEMAS } from '../app/applications/applications.service'
import type { ApplicationFormConfigDto } from './dto/application-form-config.dto'

interface ApprovalRecord {
  step: string
  operator: string
  action: 'submit' | 'approve' | 'reject'
  comment: string
  at: string
}

interface ApplicationQuery {
  page: number
  pageSize: number
  type?: string
  status?: 'pending' | 'approved' | 'rejected'
}

interface GrantResult {
  userId: string | null
  enterpriseId: string | null
  profileId?: string | null
}

const IDENTITY_FIRST_BIND_POINTS_REASON = '首次入驻/绑定身份'
const IDENTITY_FIRST_BIND_EXP_REASON = '首次绑定社区身份'

/* 申请类型（五类，与前端 applicationTypeMap 对齐）：
 *   settle      企业入驻申请 → 通过：新增/激活社区企业 + community_enterprise 身份
 *   individual  个体入驻申请 → 通过：新增 community_individual 身份（社区个体）
 *   cooperation 企业合作申请 → 通过：新增/复用合作企业档案 + external_enterprise 身份
 *   identity    身份绑定申请 → 通过：按目标企业归属（社区企业或合作企业，缺失则自动新增合作企业）
 *   exit        企业退驻申请 → 通过：企业转为已退驻并撤下展示名片
 */
const APPLICATION_TYPE_LABELS: Record<string, string> = {
  settle: '企业入驻',
  individual: '个体入驻',
  cooperation: '企业合作',
  identity: '身份绑定',
  exit: '企业退驻',
}
const APPLICATION_TYPES = Object.keys(APPLICATION_TYPE_LABELS)

/* 申请审核（wiki-backend.md §7.5/§8.6）：
 * 身份类申请通过时授予申请人对应身份（grantIdentity 服务端化），
 * 并联动企业/合作企业新增 + 首绑积分/经验值发放（identity_first_bind）。 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly engine: PointsEngineService,
    private readonly redis: RedisService,
    private readonly notify: NotificationService,
  ) {}

  async formConfigs() {
    const rows = await this.prisma.applicationFormConfig.findMany()
    const stored = new Map(rows.map((row) => [row.type, row]))
    return Object.entries(DEFAULT_APPLICATION_SCHEMAS).map(([type, fallback]) => {
      const row = stored.get(type)
      return row
        ? { type, title: row.title, subtitle: row.subtitle, submitLabel: row.submitLabel, tips: row.tips, fields: row.fields, updatedAt: row.updatedAt }
        : fallback
    })
  }

  async saveFormConfig(type: string, dto: ApplicationFormConfigDto, operator: string): Promise<{ code: number }> {
    if (!(type in DEFAULT_APPLICATION_SCHEMAS)) throw new NotFoundException('申请表单类型不存在')
    this.validateFormConfig(dto)
    const fields = dto.fields.map((field) => {
      const { extraProperties, options, ...known } = field
      return {
        ...extraProperties,
        ...known,
        ...(options ? { options: options.map(({ extraProperties: optionExtra, ...option }) => ({ ...optionExtra, ...option })) } : {}),
      }
    })
    const now = formatNow()
    await this.prisma.applicationFormConfig.upsert({
      where: { type },
      create: { type, title: dto.title.trim(), subtitle: dto.subtitle.trim(), submitLabel: dto.submitLabel.trim(), tips: dto.tips as Prisma.InputJsonValue, fields: fields as Prisma.InputJsonValue, updatedAt: now },
      update: { title: dto.title.trim(), subtitle: dto.subtitle.trim(), submitLabel: dto.submitLabel.trim(), tips: dto.tips as Prisma.InputJsonValue, fields: fields as Prisma.InputJsonValue, updatedAt: now },
    })
    await this.audit.record({
      module: '申请审核',
      action: '更新申请表单配置',
      target: type,
      after: { title: dto.title, fieldCount: dto.fields.length },
      operator,
    })
    return { code: 0 }
  }

  private validateFormConfig(dto: ApplicationFormConfigDto): void {
    if (!dto.title.trim() || !dto.submitLabel.trim()) throw new BadRequestException('表单标题和提交按钮文案不能为空')
    const keys = new Set<string>()
    for (const [index, field] of dto.fields.entries()) {
      field.key = field.key.trim()
      field.label = field.label.trim()
      if (!field.label) throw new BadRequestException(`第 ${index + 1} 个字段的标题不能为空`)
      if (keys.has(field.key)) throw new BadRequestException(`第 ${index + 1} 个字段的 key 重复`)
      keys.add(field.key)
      if (field.type === 'select') {
        if (!field.options?.length) throw new BadRequestException(`字段「${field.label}」至少需要一个选项`)
        const values = new Set<string>()
        for (const option of field.options) {
          option.label = option.label.trim()
          option.value = option.value.trim()
          if (!option.label || !option.value) throw new BadRequestException(`字段「${field.label}」存在空选项`)
          if (values.has(option.value)) throw new BadRequestException(`字段「${field.label}」存在重复选项值`)
          values.add(option.value)
        }
      } else if (field.options !== undefined) {
        throw new BadRequestException(`仅选择字段「${field.label}」可以配置选项`)
      }
      if (field.type !== 'text' && field.type !== 'textarea' && field.maxlength !== undefined) {
        throw new BadRequestException(`字段「${field.label}」不支持最大长度`)
      }
      if (field.type !== 'upload' && (field.accept !== undefined || field.multiple !== undefined || field.maxCount !== undefined)) {
        throw new BadRequestException(`仅上传字段「${field.label}」可以配置上传属性`)
      }
      if (field.type === 'upload' && field.multiple !== true && (field.maxCount ?? 1) !== 1) {
        throw new BadRequestException(`单文件上传字段「${field.label}」的最大数量必须为 1`)
      }
      if (field.type === 'upload' && field.accept && !field.accept.split(',').every((item) => /^(?:[\w.+-]+\/(?:\*|[\w.+-]+)|\.[\w]+)$/.test(item.trim()))) {
        throw new BadRequestException(`字段「${field.label}」的文件类型限制无效`)
      }
    }
  }

  async findAll(query: ApplicationQuery): Promise<{ list: unknown[]; total: number }> {
    const where: Prisma.ApplicationWhereInput = { type: { in: APPLICATION_TYPES }, deletedAt: null }
    if (query.type) where.type = query.type
    if (query.status) where.status = query.status

    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.application.count({ where }),
    ])
    const uidByPhone = await this.resolveApplicantIds(rows.map((r) => r.applicantPhone))
    const list = rows.map((r) => ({
      ...r,
      details: this.detailEntries(r.type, r.details),
      applicantId: uidByPhone.get(r.applicantPhone) ?? null,
    }))
    return { list, total }
  }

  /** 申请人用户 ID 派生（申请单仅存手机号，按手机号匹配注册用户；无匹配返回 null） */
  private async resolveApplicantIds(phones: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(phones.filter(Boolean))]
    if (!unique.length) return new Map()
    const users = await this.prisma.user.findMany({
      where: { phone: { in: unique } },
      select: { uid: true, phone: true },
    })
    return new Map(users.map((u) => [u.phone, u.uid]))
  }

  /** 审核单打印（复用申请详情数据，无新表） */
  async print(id: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.application.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('申请不存在')
    const label = APPLICATION_TYPE_LABELS[row.type] ?? '申请'
    const uidByPhone = await this.resolveApplicantIds([row.applicantPhone])
    return {
      title: `聚屿社区 · ${label}审核单`,
      generatedAt: formatNow(),
      application: {
        ...row,
        details: this.detailEntries(row.type, row.details),
        applicantId: uidByPhone.get(row.applicantPhone) ?? null,
      },
    }
  }

  async approve(id: string, comment: string | undefined, operator: string): Promise<{ code: number }> {
    const app = await this.prisma.application.findUnique({ where: { id } })
    if (!app) throw new NotFoundException('申请不存在')
    if (app.status !== 'pending') throw new ConflictException('该申请已处理')

    const records = this.appendRecord(app.records, {
      step: '运营审核',
      operator,
      action: 'approve',
      comment: comment || '同意',
      at: formatNow(),
    })

    const grant = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.application.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'approved', records, archivableAt: formatNow() },
      })
      if (claimed.count !== 1) throw new ConflictException('该申请已处理')
      if (app.type === 'exit') {
        const enterprise = await tx.enterprise.findFirst({ where: { name: app.targetName, deletedAt: null } })
        if (!enterprise) throw new NotFoundException('企业不存在')
        await tx.enterprise.update({ where: { id: enterprise.id }, data: { status: 'exited', showcaseStatus: 'none' } })
        return { userId: null, enterpriseId: enterprise.id }
      }
      return this.grantIdentity(tx, app)
    })

    if (grant.userId) {
      await this.engine.issuePoints(grant.userId, 'identity_first_bind', IDENTITY_FIRST_BIND_POINTS_REASON)
      if (grant.enterpriseId) {
        await this.engine.issueExperience(
          'enterprise',
          grant.enterpriseId,
          'identity_first_bind',
          IDENTITY_FIRST_BIND_EXP_REASON,
        )
      }
    }

    await this.audit.record({
      module: '审核中心',
      action: '审核通过',
      target: `${app.id} · ${app.targetName}`,
      detail: APPLICATION_TYPE_LABELS[app.type] ?? app.type,
      before: { status: app.status, targetName: app.targetName },
      after: {
        status: 'approved',
        grantedUserId: grant.userId,
        grantedEnterpriseId: grant.enterpriseId,
        grantedProfileId: grant.profileId ?? null,
      },
      operator,
    })

    /* 失效工作台聚合缓存，避免 60s 内待办卡片残留已处理项 */
    await this.redis.delCache(CACHE_KEYS.dashboardSummary)
    const applicant = await this.prisma.user.findFirst({ where: { phone: app.applicantPhone }, select: { uid: true } })
    if (applicant) {
      await this.notify.pushNotice(applicant.uid, {
        type: 'audit_result',
        title: `${APPLICATION_TYPE_LABELS[app.type] ?? '申请'}已通过`,
        content: comment || '您的申请已审核通过。',
      })
    }

    return { code: 0 }
  }

  async reject(id: string, comment: string | undefined, operator: string): Promise<{ code: number }> {
    const app = await this.prisma.application.findUnique({ where: { id } })
    if (!app) throw new NotFoundException('申请不存在')
    if (app.status !== 'pending') throw new ConflictException('该申请已处理')

    const records = this.appendRecord(app.records, {
      step: '运营审核',
      operator,
      action: 'reject',
      comment: comment || '不同意',
      at: formatNow(),
    })

    const claimed = await this.prisma.application.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'rejected', records, archivableAt: formatNow() },
    })
    if (claimed.count !== 1) throw new ConflictException('该申请已处理')

    await this.audit.record({
      module: '审核中心',
      action: '审核驳回',
      target: `${app.id} · ${app.targetName}`,
      detail: comment || undefined,
      before: { status: app.status },
      after: { status: 'rejected' },
      operator,
    })

    /* 失效工作台聚合缓存，避免 60s 内待办卡片残留已处理项 */
    await this.redis.delCache(CACHE_KEYS.dashboardSummary)
    const applicant = await this.prisma.user.findFirst({ where: { phone: app.applicantPhone }, select: { uid: true } })
    if (applicant) {
      await this.notify.pushNotice(applicant.uid, {
        type: 'audit_result',
        title: `${APPLICATION_TYPE_LABELS[app.type] ?? '申请'}未通过`,
        content: comment || '您的申请未获通过。',
      })
    }

    return { code: 0 }
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const row = await this.prisma.application.findFirst({ where: { id, deletedAt: null } })
    if (!row) throw new NotFoundException('申请不存在')
    if (row.status !== 'approved' && row.status !== 'rejected') {
      throw new ConflictException('仅已通过或已驳回的申请可归档')
    }

    await this.prisma.application.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '审核中心',
      action: '归档申请',
      target: `${row.applicantName} · ${row.targetName}`,
      before: { status: row.status },
      after: { deleted: true },
      operator,
    })

    return { code: 0 }
  }

  /** 同时兼容历史 [{label,value}] 与客户端 schema 表单的 {fields:{key:value}}。 */
  private detailValue(details: Prisma.JsonValue, label: string, ...keys: string[]): string | null {
    if (Array.isArray(details)) {
      const item = (details as { label?: string; value?: string }[]).find((detail) => detail?.label === label)
      return typeof item?.value === 'string' && item.value.trim() ? item.value.trim() : null
    }
    if (!details || typeof details !== 'object') return null
    const payload = details as Record<string, unknown>
    for (const key of keys) {
      const value = payload[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }
    const fields = payload.fields
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null
    for (const key of keys) {
      const value = (fields as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }
    return null
  }

  private detailEntries(type: string, details: Prisma.JsonValue): { label: string; value: string }[] {
    if (Array.isArray(details)) return details as unknown as { label: string; value: string }[]
    if (!details || typeof details !== 'object') return []
    const payload = details as Record<string, unknown>
    const fields = payload.fields
    const schema = DEFAULT_APPLICATION_SCHEMAS[type as keyof typeof DEFAULT_APPLICATION_SCHEMAS]
    const labels = new Map(schema?.fields.map((field) => [field.key, field.label]) ?? [])
    const entries: { label: string; value: string }[] = []
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      for (const [key, value] of Object.entries(fields)) {
        const display = Array.isArray(value)
          ? value.map((item) => item && typeof item === 'object' && 'name' in item ? String(item.name) : String(item)).join('、')
          : String(value ?? '')
        if (display) entries.push({ label: labels.get(key) ?? key, value: display })
      }
    }
    if (typeof payload.note === 'string' && payload.note.trim()) entries.push({ label: '补充说明', value: payload.note })
    return entries
  }

  /** 解析「企业名 · 头衔」目标 */
  private splitTarget(targetName: string): { name: string; title: string } {
    const sep = targetName.indexOf(' · ')
    if (sep > 0) return { name: targetName.slice(0, sep), title: targetName.slice(sep + 3) }
    return { name: targetName, title: '' }
  }

  /** 合作企业档案：存在即复用，缺失则按申请表单新增（企业合作/身份绑定均使用） */
  private async ensureCooperationProfile(
    tx: Prisma.TransactionClient,
    name: string,
    details: Prisma.JsonValue,
  ): Promise<string> {
    const existing = await tx.externalEnterpriseProfile.findFirst({ where: { name } })
    if (existing) return existing.id
    const created = await tx.externalEnterpriseProfile.create({
      data: {
        id: await this.ids.next('XE'),
        name,
        industry: this.detailValue(details, '行业', 'industry') ?? '综合',
        status: 'active',
        size: this.detailValue(details, '团队规模', 'companySize') ?? '',
        foundedAt: this.detailValue(details, '成立时间', 'foundedAt') ?? '',
        description: this.detailValue(details, '企业简介', 'intro', 'coopField') ?? '审核通过自动新增的合作企业',
        cooperationCount: 0,
        firstCooperationAt: formatNow().slice(0, 7),
      },
    })
    return created.id
  }

  /* 审核通过授予身份（四类分支）：
   *   settle      新增/激活社区企业（字段取自申请表单）→ community_enterprise 身份（去重）
   *   individual  新增 community_individual 身份（社区个体，去重）
   *   cooperation 新增/复用合作企业档案 → external_enterprise 身份（去重）
   *   identity    目标企业在社区企业名单 → community_enterprise 身份；
   *               否则在合作企业名单（缺失则自动新增合作企业）→ external_enterprise 身份
   * 仅在真正新增身份时返回 userId（触发首绑积分/经验值）；enterpriseId 仅在社区企业时返回。 */
  private async grantIdentity(tx: Prisma.TransactionClient, app: {
    type: string
    applicantPhone: string
    targetName: string
    details: Prisma.JsonValue
  }): Promise<GrantResult> {
    const user = await tx.user.findFirst({ where: { phone: app.applicantPhone } })
    if (!user) return { userId: null, enterpriseId: null }

    const { type, details } = app
    const { name, title } = this.splitTarget(app.targetName)

    if (type === 'settle') {
      const entName = this.detailValue(details, '企业名称', 'companyName') ?? name
      const applyingSpace = this.detailValue(details, '申请空间', 'officeNeeds') ?? ''
      let ent = await tx.enterprise.findFirst({ where: { name: entName } })
      if (!ent) {
        ent = await tx.enterprise.create({
          data: {
            id: await this.ids.next('E'),
            name: entName,
            industry: '综合',
            size: this.detailValue(details, '团队规模', 'companySize') ?? '1-50 人',
            foundedAt: formatNow().slice(0, 7),
            settledAt: formatToday(),
            leaseType: applyingSpace.includes('独立办公室') ? '独立办公室' : '办公位',
            status: 'active',
            showcaseStatus: 'none',
            contactUserId: user.uid,
            contactTitle: '社区企业成员',
            contactName: user.nickname,
            contactPhone: app.applicantPhone,
            contactEmail: user.email,
            description: '审核通过自动新增的社区企业',
            tags: [],
          },
        })
      } else if (ent.status !== 'active') {
        ent = await tx.enterprise.update({
          where: { id: ent.id },
          data: { status: 'active', settledAt: ent.settledAt ?? formatToday() },
        })
      }

      const dup = await tx.userIdentity.findFirst({
        where: { userId: user.uid, type: 'community_enterprise', enterpriseId: ent.id },
      })
      if (dup) return { userId: null, enterpriseId: null }
      await tx.userIdentity.create({
        data: {
          userId: user.uid,
          type: 'community_enterprise',
          enterpriseId: ent.id,
          enterpriseName: ent.name,
          role: 'member',
          title: '社区企业成员',
          level: await this.enterpriseLevel(tx, ent.experience),
          experience: ent.experience,
        },
      })
      return { userId: user.uid, enterpriseId: ent.id }
    }

    if (type === 'individual') {
      const dup = await tx.userIdentity.findFirst({
        where: { userId: user.uid, type: 'community_individual' },
      })
      if (dup) return { userId: null, enterpriseId: null }
      await tx.userIdentity.create({
        data: {
          userId: user.uid,
          type: 'community_individual',
          title: title || '社区个体',
          level: 1,
          experience: 0,
        },
      })
      return { userId: user.uid, enterpriseId: null }
    }

    if (type === 'cooperation') {
      const profileId = await this.ensureCooperationProfile(tx, name, details)
      const dup = await tx.userIdentity.findFirst({
        where: { userId: user.uid, type: 'external_enterprise', enterpriseName: name },
      })
      if (dup) return { userId: null, enterpriseId: null, profileId }
      await tx.userIdentity.create({
        data: {
          userId: user.uid,
          type: 'external_enterprise',
          enterpriseName: name,
          title: title || '合作方',
        },
      })
      return { userId: user.uid, enterpriseId: null, profileId }
    }

    const bindType = this.detailValue(details, '要绑定的身份', 'identityType')
    if (bindType === 'community_individual') {
      const duplicate = await tx.userIdentity.findFirst({ where: { userId: user.uid, type: 'community_individual' } })
      if (duplicate) return { userId: null, enterpriseId: null }
      await tx.userIdentity.create({
        data: {
          userId: user.uid,
          type: 'community_individual',
          title: '社区个体',
          level: 1,
          experience: 0,
        },
      })
      return { userId: user.uid, enterpriseId: null }
    }

    /* 企业身份绑定：优先社区企业，其次合作企业（缺失自动新增）。 */
    const community = await tx.enterprise.findFirst({ where: { name } })
    if (community) {
      const dup = await tx.userIdentity.findFirst({
        where: { userId: user.uid, type: 'community_enterprise', enterpriseId: community.id },
      })
      if (dup) return { userId: null, enterpriseId: null }
      await tx.userIdentity.create({
        data: {
          userId: user.uid,
          type: 'community_enterprise',
          enterpriseId: community.id,
          enterpriseName: community.name,
          role: 'member',
          title: title || '企业成员',
          level: await this.enterpriseLevel(tx, community.experience),
          experience: community.experience,
        },
      })
      return { userId: user.uid, enterpriseId: community.id }
    }

    const profileId = await this.ensureCooperationProfile(tx, name, details)
    const dup = await tx.userIdentity.findFirst({
      where: { userId: user.uid, type: 'external_enterprise', enterpriseName: name },
    })
    if (dup) return { userId: null, enterpriseId: null, profileId }
    await tx.userIdentity.create({
      data: {
        userId: user.uid,
        type: 'external_enterprise',
        enterpriseName: name,
        title: title || '合作方',
      },
    })
    return { userId: user.uid, enterpriseId: null, profileId }
  }

  private appendRecord(raw: Prisma.JsonValue, record: ApprovalRecord): Prisma.InputJsonValue {
    const list: ApprovalRecord[] = Array.isArray(raw) ? (raw as unknown as ApprovalRecord[]) : []
    return [...list, record] as unknown as Prisma.InputJsonValue
  }

  private async enterpriseLevel(tx: Prisma.TransactionClient, experience: number): Promise<number> {
    const tier = await tx.levelTier.findFirst({
      where: { identityType: 'community_enterprise', threshold: { lte: experience } },
      orderBy: { threshold: 'desc' },
    })
    return tier?.level ?? 1
  }
}
