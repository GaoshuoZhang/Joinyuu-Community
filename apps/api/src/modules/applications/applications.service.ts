import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { RedisService } from '../../common/redis/redis.service'
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

/* 申请类型（四类，与前端 applicationTypeMap 对齐）：
 *   settle      企业入驻申请 → 通过：新增/激活社区企业 + community_enterprise 身份
 *   individual  个体入驻申请 → 通过：新增 community_individual 身份（社区个体）
 *   cooperation 企业合作申请 → 通过：新增/复用合作企业档案 + external_enterprise 身份
 *   identity    身份绑定申请 → 通过：按目标企业归属（社区企业或合作企业，缺失则自动新增合作企业）
 */
const APPLICATION_TYPE_LABELS: Record<string, string> = {
  settle: '企业入驻',
  individual: '个体入驻',
  cooperation: '企业合作',
  identity: '身份绑定',
}
const APPLICATION_TYPES = Object.keys(APPLICATION_TYPE_LABELS)

/* 申请审核（wiki-backend.md §7.5/§8.6）：
 * 仅上述四类；通过时授予申请人对应身份（grantIdentity 服务端化），
 * 并联动企业/合作企业新增 + 首绑积分/经验值发放（identity_first_bind）。 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly engine: PointsEngineService,
    private readonly redis: RedisService,
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
    const now = formatNow()
    await this.prisma.applicationFormConfig.upsert({
      where: { type },
      create: { type, title: dto.title.trim(), subtitle: dto.subtitle.trim(), submitLabel: dto.submitLabel.trim(), tips: dto.tips as Prisma.InputJsonValue, fields: dto.fields as Prisma.InputJsonValue, updatedAt: now },
      update: { title: dto.title.trim(), subtitle: dto.subtitle.trim(), submitLabel: dto.submitLabel.trim(), tips: dto.tips as Prisma.InputJsonValue, fields: dto.fields as Prisma.InputJsonValue, updatedAt: now },
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
    const list = rows.map((r) => ({ ...r, applicantId: uidByPhone.get(r.applicantPhone) ?? null }))
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
      application: { ...row, applicantId: uidByPhone.get(row.applicantPhone) ?? null },
    }
  }

  async approve(id: string, comment: string | undefined, operator: string): Promise<{ code: number }> {
    const app = await this.prisma.application.findUnique({ where: { id } })
    if (!app) throw new NotFoundException('申请不存在')

    const records = this.appendRecord(app.records, {
      step: '运营审核',
      operator,
      action: 'approve',
      comment: comment || '同意',
      at: formatNow(),
    })

    const grant = await this.prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id },
        data: { status: 'approved', records, archivableAt: formatNow() },
      })
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

    return { code: 0 }
  }

  async reject(id: string, comment: string | undefined, operator: string): Promise<{ code: number }> {
    const app = await this.prisma.application.findUnique({ where: { id } })
    if (!app) throw new NotFoundException('申请不存在')

    const records = this.appendRecord(app.records, {
      step: '运营审核',
      operator,
      action: 'reject',
      comment: comment || '不同意',
      at: formatNow(),
    })

    await this.prisma.application.update({
      where: { id },
      data: { status: 'rejected', records, archivableAt: formatNow() },
    })

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

  /** 从申请表单 details（[{label,value}]）取字段值 */
  private detailValue(details: Prisma.JsonValue, label: string): string | null {
    if (!Array.isArray(details)) return null
    const item = (details as { label?: string; value?: string }[]).find((d) => d?.label === label)
    return typeof item?.value === 'string' && item.value.trim() ? item.value.trim() : null
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
        industry: this.detailValue(details, '行业') ?? '综合',
        status: 'active',
        size: this.detailValue(details, '团队规模') ?? '',
        foundedAt: this.detailValue(details, '成立时间') ?? '',
        description: this.detailValue(details, '企业简介') ?? '审核通过自动新增的合作企业',
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
      const entName = this.detailValue(details, '企业名称') ?? name
      const applyingSpace = this.detailValue(details, '申请空间') ?? ''
      let ent = await tx.enterprise.findFirst({ where: { name: entName } })
      if (!ent) {
        ent = await tx.enterprise.create({
          data: {
            id: await this.ids.next('E'),
            name: entName,
            industry: '综合',
            size: this.detailValue(details, '团队规模') ?? '1-50 人',
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
          level: 1,
          experience: 0,
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

    /* type === 'identity'：优先社区企业，其次合作企业（缺失自动新增） */
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
          level: 1,
          experience: 0,
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
}
