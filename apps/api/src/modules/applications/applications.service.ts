import { Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { formatNow, formatToday } from '../../common/utils/time'

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
  type?: 'settle' | 'identity'
  status?: 'pending' | 'approved' | 'rejected'
}

interface GrantResult {
  userId: string | null
  enterpriseId: string | null
}

const IDENTITY_FIRST_BIND_POINTS_REASON = '首次入驻/绑定身份'
const IDENTITY_FIRST_BIND_EXP_REASON = '首次绑定社区身份'

/* 申请审批（wiki-backend.md §7.5/§8.6）：
 * 仅 settle/identity 两类；通过时授予申请人对应身份（grantIdentity 服务端化），
 * 并联动企业创建/激活 + 首绑积分/经验发放（identity_first_bind）。 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly engine: PointsEngineService,
  ) {}

  async findAll(query: ApplicationQuery): Promise<{ list: unknown[]; total: number }> {
    const where: Prisma.ApplicationWhereInput = { type: { in: ['settle', 'identity'] } }
    if (query.type) where.type = query.type
    if (query.status) where.status = query.status

    const [list, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.application.count({ where }),
    ])
    return { list, total }
  }

  async approve(id: string, comment: string | undefined, operator: string): Promise<{ code: number }> {
    const app = await this.prisma.application.findUnique({ where: { id } })
    if (!app) throw new NotFoundException('申请不存在')

    const records = this.appendRecord(app.records, {
      step: '运营审批',
      operator,
      action: 'approve',
      comment: comment || '同意',
      at: formatNow(),
    })

    const grant = await this.prisma.$transaction(async (tx) => {
      await tx.application.update({ where: { id }, data: { status: 'approved', records } })
      return this.grantIdentity(tx, app.type, app.applicantPhone, app.targetName)
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
      module: '审批中心',
      action: '审批通过',
      target: `${app.id} · ${app.targetName}`,
      detail: app.type === 'settle' ? '入驻申请' : '身份绑定',
      operator,
    })

    return { code: 0 }
  }

  async reject(id: string, comment: string | undefined, operator: string): Promise<{ code: number }> {
    const app = await this.prisma.application.findUnique({ where: { id } })
    if (!app) throw new NotFoundException('申请不存在')

    const records = this.appendRecord(app.records, {
      step: '运营审批',
      operator,
      action: 'reject',
      comment: comment || '不同意',
      at: formatNow(),
    })

    await this.prisma.application.update({ where: { id }, data: { status: 'rejected', records } })

    await this.audit.record({
      module: '审批中心',
      action: '审批驳回',
      target: `${app.id} · ${app.targetName}`,
      detail: comment || undefined,
      operator,
    })

    return { code: 0 }
  }

  /* 审批通过授予身份（对照 apps/admin/src/api/applications.ts grantIdentity 逐条迁移）：
   * settle → 企业不存在则创建 / 存在非 active 则激活 → 追加 community_enterprise 身份（去重）
   * identity → targetName 按「企业名 · 头衔」解析 → 追加 external_enterprise 身份（去重）
   * 仅在真正新增身份时返回 userId（触发首绑积分/经验） */
  private async grantIdentity(
    tx: Prisma.TransactionClient,
    type: string,
    applicantPhone: string,
    targetName: string,
  ): Promise<GrantResult> {
    const user = await tx.user.findFirst({ where: { phone: applicantPhone } })
    if (!user) return { userId: null, enterpriseId: null }

    if (type === 'settle') {
      let ent = await tx.enterprise.findFirst({ where: { name: targetName } })
      if (!ent) {
        ent = await tx.enterprise.create({
          data: {
            id: await this.ids.next('E'),
            name: targetName,
            industry: '综合',
            stage: '初创',
            size: '1-50 人',
            foundedAt: formatNow().slice(0, 7),
            settledAt: formatToday(),
            leaseType: '工位',
            status: 'active',
            showcaseStatus: 'none',
            contactName: user.nickname,
            contactPhone: applicantPhone,
            contactEmail: user.email,
            description: '审批通过自动创建的入驻企业',
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
      if (!dup) {
        await tx.userIdentity.create({
          data: {
            userId: user.uid,
            type: 'community_enterprise',
            enterpriseId: ent.id,
            enterpriseName: ent.name,
            role: 'member',
            title: '入驻企业成员',
            level: 1,
            experience: 0,
          },
        })
        return { userId: user.uid, enterpriseId: ent.id }
      }
      return { userId: null, enterpriseId: null }
    }

    const sep = targetName.indexOf(' · ')
    const entName = sep > 0 ? targetName.slice(0, sep) : targetName
    const title = sep > 0 ? targetName.slice(sep + 3) : '合作方'
    const dup = await tx.userIdentity.findFirst({
      where: { userId: user.uid, type: 'external_enterprise', enterpriseName: entName },
    })
    if (!dup) {
      await tx.userIdentity.create({
        data: {
          userId: user.uid,
          type: 'external_enterprise',
          enterpriseName: entName,
          title,
        },
      })
      return { userId: user.uid, enterpriseId: null }
    }
    return { userId: null, enterpriseId: null }
  }

  private appendRecord(raw: Prisma.JsonValue, record: ApprovalRecord): Prisma.InputJsonValue {
    const list: ApprovalRecord[] = Array.isArray(raw) ? (raw as unknown as ApprovalRecord[]) : []
    return [...list, record] as unknown as Prisma.InputJsonValue
  }
}
