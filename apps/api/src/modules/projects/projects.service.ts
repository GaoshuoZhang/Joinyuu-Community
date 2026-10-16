import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Milestone, Project, ProjectUndertaker } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import { AssetsService, type AssetSource, type MallAssetDto, type UploadedFileLike } from '../assets/assets.service'
import { ProjectMilestoneReviewService } from './project-milestone-review.service'
import type { QueryProjectsDto } from './dto/query-projects.dto'

/* 承接方输入（ProjectInitPayload.undertakers，锁定签名）：enterprise=社区企业 / individual=用户 / custom=自定义 */
export interface UndertakerInput {
  type: 'enterprise' | 'individual' | 'custom'
  /** 企业 ID / 用户 ID / 自定义项为空串 */
  id: string
  /** 承接占比（整数百分比，合计须为 100） */
  share: number
  name?: string
  contactName?: string
  phone?: string
}

export interface MilestoneInput {
  name: string
  date: string
  /** 负责该节点的承接方展示名（可多选） */
  owners: string[]
}

export interface ProjectCreatePayload {
  projectName: string
  undertakers: UndertakerInput[]
  startDate?: string
  endDate?: string
  description: string
  milestones: MilestoneInput[]
  expReward?: number
  /* 需求方 / 创建人 / 联系方式 / 合同价格：
   * - 需求立项：由服务端按来源需求快照覆盖（客户端传值不生效）；
   * - 社区自建：由「新增项目」表单录入。 */
  demanderId?: string
  demanderName?: string
  demanderIdentity?: Prisma.InputJsonValue | null
  creatorName?: string
  creatorId?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  contractPrice?: string
}

/* 返回形状与 apps/admin/src/types/index.ts 逐字段一致 */
export interface ProjectUndertakerDto {
  type: string
  /** 承接方 ID（DB 列 refId 映射为响应字段 id） */
  id: string
  name: string
  share: number
  contactName?: string
  phone?: string
}

export interface MilestoneDto {
  /** 里程碑主键（前端按 id 定位具体节点做验收/驳回） */
  id: string
  name: string
  status: 'todo' | 'submitted' | 'accepted' | 'returned'
  date: string
  owners?: string[]
}

export interface ProjectDto {
  id: string
  name: string
  code: string
  undertakers: ProjectUndertakerDto[]
  status: string
  progress: number
  startDate: string
  endDate: string
  initiatedAt: string
  description: string
  milestones: MilestoneDto[]
  memberCount: number
  sourceDemandId?: string
  expReward?: number
  closeReason?: string
  finishedAt?: string
  deletedAt?: string
  /* 需求方 / 创建人 / 联系方式 / 合同价格（历史项目可能缺省） */
  demanderId?: string
  demanderName?: string
  demanderIdentity?: unknown
  creatorName?: string
  creatorId?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  contractPrice?: string
}

type ProjectWithRelations = Project & { undertakers: ProjectUndertaker[]; milestones: Milestone[] }

/* 名称解析后的承接方（refId = 输入 id，插入与映射共用） */
interface ResolvedUndertaker {
  type: string
  refId: string
  name: string
  share: number
  contactName?: string | null
  phone?: string | null
}

/* 项目合同附件的素材来源标记：sourceType=project / sourceId=项目编号 */
const projectContractSource = (projectId: string): AssetSource => ({ type: 'project', id: projectId })

/* 项目域（wiki-backend.md §7.7/§8.5）：
 * 列表筛选/排序/分页、详情、新增（含锁定 createProject 供 demands 复用）、编辑、暂停/恢复/关闭状态机、
 * 里程碑验收/驳回（复用 ProjectMilestoneReviewService：全通过自动结项并按承接占比分配经验值） */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly assets: AssetsService,
    private readonly reviews: ProjectMilestoneReviewService,
  ) {}

  async findAll(query: QueryProjectsDto): Promise<{ list: ProjectDto[]; total: number }> {
    const where: Prisma.ProjectWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { code: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.status) where.status = { in: query.status }

    /* 参与人/企业筛选下沉数据库（承接方关联 some）；两者并存时按 AND 叠加，保持原「依次过滤」语义 */
    const and: Prisma.ProjectWhereInput[] = []
    if (query.participant) {
      const user = await this.prisma.user.findUnique({
        where: { uid: query.participant },
        include: { identities: true },
      })
      const enterpriseIds =
        user?.identities
          .filter((i) => i.type === 'community_enterprise' && i.enterpriseId != null)
          .map((i) => i.enterpriseId as string) ?? []
      and.push({
        undertakers: {
          some: {
            OR: [
              { type: 'individual', refId: query.participant },
              { type: 'enterprise', refId: { in: enterpriseIds } },
            ],
          },
        },
      })
    }

    if (query.enterprise) {
      const isCommunity = !!(await this.prisma.enterprise.findUnique({ where: { id: query.enterprise } }))
      if (isCommunity) {
        and.push({ undertakers: { some: { type: 'enterprise', refId: query.enterprise } } })
      } else {
        const profile = await this.prisma.externalEnterpriseProfile.findUnique({
          where: { id: query.enterprise },
        })
        const memberIds = profile
          ? (
              await this.prisma.userIdentity.findMany({
                where: { type: 'external_enterprise', enterpriseName: profile.name },
                select: { userId: true },
              })
            ).map((m) => m.userId)
          : []
        and.push({ undertakers: { some: { type: 'individual', refId: { in: memberIds } } } })
      }
    }
    if (and.length) where.AND = and

    /* 排序：默认立项日期倒序（最新立项在前），可按立项日期/编号正倒序；排序与计数、分页一并下发数据库 */
    const desc = query.sortOrder !== 'ascend'
    const field = query.sortBy ?? 'initiatedAt'
    const offset = (query.page - 1) * query.pageSize

    let page: Project[]
    let total: number
    if (field === 'id') {
      /* Prisma orderBy 只能按字符串比较编号（P9/P10 会错序），故保留数值序：
       * 仅取编号列在库内过滤后内存定位当页编号，再按编号批量取当页行，避免整行全表载入 */
      const dir = desc ? -1 : 1
      const [idRows, count] = await Promise.all([
        this.prisma.project.findMany({ where, select: { id: true } }),
        this.prisma.project.count({ where }),
      ])
      const pageIds = idRows
        .map((row) => row.id)
        .sort((a, b) => {
          const av = Number(a.replace('P', ''))
          const bv = Number(b.replace('P', ''))
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        })
        .slice(offset, offset + query.pageSize)
      page = pageIds.length ? await this.prisma.project.findMany({ where: { id: { in: pageIds } } }) : []
      const pos = new Map(pageIds.map((id, index) => [id, index]))
      page.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
      total = count
    } else {
      const [list, count] = await Promise.all([
        this.prisma.project.findMany({
          where,
          orderBy: { initiatedAt: desc ? 'desc' : 'asc' },
          skip: offset,
          take: query.pageSize,
        }),
        this.prisma.project.count({ where }),
      ])
      page = list
      total = count
    }

    /* 仅当页批量补取承接方与里程碑（替代全量 include，随分页收缩载入量） */
    const pageIds = page.map((p) => p.id)
    const [undertakers, milestones] = await Promise.all([
      pageIds.length
        ? this.prisma.projectUndertaker.findMany({ where: { projectId: { in: pageIds } }, orderBy: { id: 'asc' } })
        : [],
      pageIds.length
        ? this.prisma.milestone.findMany({ where: { projectId: { in: pageIds } }, orderBy: { id: 'asc' } })
        : [],
    ])
    const undertakersByProject = new Map<string, ProjectUndertaker[]>()
    for (const u of undertakers) {
      const arr = undertakersByProject.get(u.projectId) ?? []
      arr.push(u)
      undertakersByProject.set(u.projectId, arr)
    }
    const milestonesByProject = new Map<string, Milestone[]>()
    for (const m of milestones) {
      const arr = milestonesByProject.get(m.projectId) ?? []
      arr.push(m)
      milestonesByProject.set(m.projectId, arr)
    }

    return {
      list: page.map((p) =>
        toProjectDto({
          ...p,
          undertakers: undertakersByProject.get(p.id) ?? [],
          milestones: milestonesByProject.get(p.id) ?? [],
        }),
      ),
      total,
    }
  }

  async detail(id: string): Promise<ProjectDto> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        undertakers: { orderBy: { id: 'asc' } },
        milestones: { orderBy: { id: 'asc' } },
      },
    })
    if (!project) throw new NotFoundException('项目不存在')
    return toProjectDto(project)
  }

  /* 锁定签名（demands-api 复用）：新增项目（无来源需求）
   * 承接方非空、share 合计 100、名称解析（404 承接企业/承接人不存在）、code=JY-YYYY-NN 按年原子发号 */
  async createProject(payload: ProjectCreatePayload, operator: string): Promise<ProjectDto> {
    /* 社区自建项目：创建人缺省取当前操作人 */
    const project = await this.prisma.$transaction((tx) =>
      this.createProjectInHostTx(tx, { ...payload, creatorName: payload.creatorName ?? operator }),
    )

    await this.audit.record({
      module: '项目管理',
      action: '新增项目',
      target: `${project.id} · ${project.name}`,
      detail: project.code,
      after: { status: project.status, code: project.code },
      operator,
    })

    return toProjectDto(project)
  }

  /** 在宿主事务内新增项目（校验/名称解析/编号全部走事务连接）——供需求立项与直接新增复用 */
  async createProjectInHostTx(
    tx: Prisma.TransactionClient,
    payload: ProjectCreatePayload,
  ): Promise<ProjectWithRelations> {
    if (payload.undertakers.length === 0) throw new BadRequestException('请至少选择一个承接方')

    const undertakers = await this.resolveUndertakers(tx, payload.undertakers)
    const shareSum = undertakers.reduce((s, u) => s + u.share, 0)
    if (shareSum !== 100) throw new BadRequestException('承接占比合计须为 100%')

    /* code 序号原子取号（IdSequence），避免并发下 count+1 与 @unique(code) 冲突 */
    const year = new Date().getFullYear()
    const seq = await this.ids.nextNumber(`CODE-${year}`)
    const code = `JY-${year}-${String(seq).padStart(2, '0')}`

    return this.createProjectInTx(tx, payload, undertakers, code)
  }

  /** 事务内新增项目主体（输入校验与名称解析在事务外完成）——供需求立项在单一事务中复用 */
  async createProjectInTx(
    tx: Prisma.TransactionClient,
    payload: ProjectCreatePayload,
    undertakers: ResolvedUndertaker[],
    code: string,
  ): Promise<ProjectWithRelations> {
    const id = await this.ids.next('P')
    const milestones = payload.milestones
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), status: 'todo' as const, date: m.date, owners: m.owners ?? [] }))

    const created = await tx.project.create({
      data: {
        id,
        name: payload.projectName,
        code,
        status: 'running',
        progress: 0,
        startDate: payload.startDate ?? '',
        endDate: payload.endDate ?? '',
        initiatedAt: formatToday(),
        description: sanitizeHtml(payload.description),
        memberCount: undertakers.length,
        expReward: payload.expReward ?? null,
        demanderId: payload.demanderId ?? null,
        demanderName: payload.demanderName ?? null,
        demanderIdentity: payload.demanderIdentity ?? Prisma.DbNull,
        creatorName: payload.creatorName ?? null,
        creatorId: payload.creatorId ?? null,
        contactName: payload.contactName ?? null,
        contactPhone: payload.contactPhone ?? null,
        contactEmail: payload.contactEmail ?? null,
        contractPrice: payload.contractPrice ?? null,
      },
    })

    for (const u of undertakers) {
      await tx.projectUndertaker.create({
        data: {
          projectId: id,
          type: u.type,
          refId: u.refId,
          name: u.name,
          share: u.share,
          contactName: u.contactName ?? null,
          phone: u.phone ?? null,
        },
      })
    }
    /* 返回真实落库行（含主键 id）：新增/立项响应的 milestones 需要可直接定位节点做验收/驳回 */
    const createdMilestones: Milestone[] = []
    for (const m of milestones) {
      createdMilestones.push(
        await tx.milestone.create({
          data: { projectId: id, name: m.name, status: m.status, date: m.date, owners: m.owners },
        }),
      )
    }

    return {
      ...created,
      undertakers: undertakers.map((u) => ({
        type: u.type,
        refId: u.refId,
        name: u.name,
        share: u.share,
        contactName: u.contactName ?? null,
        phone: u.phone ?? null,
      })) as ProjectUndertaker[],
      milestones: createdMilestones,
    }
  }

  /* 编辑（wiki-backend.md §7.7）：已结项项目只读；其余状态可编辑（前端禁用 finished 入口，后端同样强制）；
   * 不改状态/编号；里程碑整体重置为 todo；重算 memberCount */
  async update(id: string, payload: ProjectCreatePayload, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { undertakers: { orderBy: { id: 'asc' } } },
    })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status === 'finished') throw new ConflictException('已结项的项目不可编辑')

    const undertakers = await this.resolveUndertakers(this.prisma, payload.undertakers)
    /* 里程碑「责任方」存的是承接方展示名（历史口径）：承接方改名后编辑保存时按 refId 同步为当前展示名，
     * 避免旧里程碑停留在失配的历史名称（G） */
    const nameByRefId = new Map(undertakers.map((u) => [`${u.type}:${u.refId}`, u.name]))
    const milestones = payload.milestones
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        status: 'todo' as const,
        date: m.date,
        owners: remapOwnerNames(m.owners ?? [], project.undertakers, nameByRefId),
      }))

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          name: payload.projectName,
          memberCount: undertakers.length,
          ...(payload.startDate != null ? { startDate: payload.startDate } : {}),
          ...(payload.endDate != null ? { endDate: payload.endDate } : {}),
          description: sanitizeHtml(payload.description),
          ...(payload.demanderId != null ? { demanderId: payload.demanderId } : {}),
          ...(payload.demanderName != null ? { demanderName: payload.demanderName } : {}),
          ...(payload.demanderIdentity !== undefined ? { demanderIdentity: payload.demanderIdentity ?? Prisma.DbNull } : {}),
          ...(payload.creatorName != null ? { creatorName: payload.creatorName } : {}),
          ...(payload.creatorId != null ? { creatorId: payload.creatorId } : {}),
          ...(payload.contactName != null ? { contactName: payload.contactName } : {}),
          ...(payload.contactPhone != null ? { contactPhone: payload.contactPhone } : {}),
          ...(payload.contactEmail != null ? { contactEmail: payload.contactEmail } : {}),
          ...(payload.contractPrice != null ? { contractPrice: payload.contractPrice } : {}),
        },
      })

      await tx.projectUndertaker.deleteMany({ where: { projectId: id } })
      for (const u of undertakers) {
        await tx.projectUndertaker.create({
          data: {
            projectId: id,
            type: u.type,
            refId: u.refId,
            name: u.name,
            share: u.share,
            contactName: u.contactName ?? null,
            phone: u.phone ?? null,
          },
        })
      }

      await tx.milestone.deleteMany({ where: { projectId: id } })
      for (const m of milestones) {
        await tx.milestone.create({
          data: { projectId: id, name: m.name, status: m.status, date: m.date, owners: m.owners },
        })
      }
    })

    await this.audit.record({
      module: '项目管理',
      action: '编辑项目',
      target: `${project.id} · ${project.name}`,
      operator,
    })

    return { code: 0 }
  }

  async pause(id: string, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'running') throw new ConflictException('仅进行中的项目可暂停')
    await this.prisma.project.update({ where: { id }, data: { status: 'paused' } })

    await this.audit.record({
      module: '项目管理',
      action: '项目暂停',
      target: `${project.id} · ${project.name}`,
      before: { status: project.status },
      after: { status: 'paused' },
      operator,
    })
    return { code: 0 }
  }

  async resume(id: string, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'paused') throw new ConflictException('仅已暂停的项目可恢复')
    await this.prisma.project.update({ where: { id }, data: { status: 'running' } })

    await this.audit.record({
      module: '项目管理',
      action: '项目恢复',
      target: `${project.id} · ${project.name}`,
      before: { status: project.status },
      after: { status: 'running' },
      operator,
    })
    return { code: 0 }
  }

  async close(id: string, reason: string | undefined, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'paused') throw new ConflictException('仅已暂停的项目可关闭')
    const trimmed = (reason ?? '').trim()
    if (!trimmed) throw new BadRequestException('请填写关闭原因')

    await this.prisma.project.update({
      where: { id },
      data: { status: 'closed', closeReason: trimmed, archivableAt: formatNow() },
    })

    await this.audit.record({
      module: '项目管理',
      action: '项目关闭',
      target: `${project.id} · ${project.name}`,
      detail: trimmed,
      before: { status: project.status },
      after: { status: 'closed', closeReason: trimmed },
      operator,
    })

    return { code: 0 }
  }

  /* ---------- 里程碑验收 / 驳回（后台「项目详情 > 进度节点」）----------
   * 状态迁移、进度重算、自动结项与里程碑积分/结项经验统一由 ProjectMilestoneReviewService 承担
   * （与客户端「我的项目」共用同一套口径），此处只做入参校验与审计落库 */

  /** 通过验收（待验收 → 已验收；全部通过自动结项并按承接占比发经验） */
  async acceptMilestone(id: string, milestoneId: string, operator: string): Promise<{ code: number }> {
    const result = await this.reviews.acceptMilestone(id, milestoneId)

    await this.audit.record({
      module: '项目管理',
      action: '里程碑验收通过',
      target: `${id} · ${result.projectName} · ${result.milestoneName}`,
      before: { status: 'submitted' },
      after: { status: 'accepted', progress: result.progress, finished: result.finished },
      operator,
    })
    return { code: 0 }
  }

  /** 驳回（待验收 → 已退回，承接方可重新提交；驳回原因必填，用于审计） */
  async returnMilestone(
    id: string,
    milestoneId: string,
    reason: string | undefined,
    operator: string,
  ): Promise<{ code: number }> {
    const trimmed = (reason ?? '').trim()
    if (!trimmed) throw new BadRequestException('请填写驳回原因')
    const result = await this.reviews.returnMilestone(id, milestoneId, trimmed)

    await this.audit.record({
      module: '项目管理',
      action: '里程碑驳回',
      target: `${id} · ${result.projectName} · ${result.milestoneName}`,
      detail: trimmed,
      before: { status: 'submitted' },
      after: { status: 'returned', returnReason: trimmed },
      operator,
    })
    return { code: 0 }
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'finished' && project.status !== 'closed') {
      throw new ConflictException('仅已结项或已关闭的项目可归档')
    }

    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '项目管理',
      action: '归档项目',
      target: `${project.id} · ${project.name}`,
      before: { status: project.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  /* ---------- 项目合同附件（线下签约合同照片/PDF 扫描件，复用素材库存储管道） ---------- */

  /** 列表：某项目的全部合同附件（最新在前）；已归档项目仍可查看历史合同 */
  async projectContracts(id: string): Promise<MallAssetDto[]> {
    await this.assertProjectVisible(id)
    return this.assets.listBySource(projectContractSource(id))
  }

  /** 上传：图片（PNG/JPEG/GIF/WebP）或 PDF，大小上限取系统配置 uploadMaxSizeMb */
  async uploadProjectContract(
    id: string,
    file: UploadedFileLike | undefined,
    operator: string,
  ): Promise<MallAssetDto> {
    await this.assertProjectWritable(id)
    return this.assets.upload(file, undefined, operator, projectContractSource(id))
  }

  /** 删除：仅允许删除该项目名下的合同附件 */
  async removeProjectContract(id: string, assetId: string, operator: string): Promise<{ code: number }> {
    await this.assertProjectWritable(id)
    return this.assets.removeBySource(assetId, projectContractSource(id), operator)
  }

  /** 合同读取前提：项目存在（已归档项目的合同仍可查看） */
  private async assertProjectVisible(id: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
  }

  /** 合同增删写操作前提：项目存在且未归档（已归档条目只读） */
  private async assertProjectWritable(id: string): Promise<void> {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } })
    if (!project) throw new NotFoundException('项目不存在')
  }

  /* 承接方展示名：企业→企业名；个人→昵称；自定义→name||id
   * db 为 PrismaService 或事务客户端，供列表校验与事务内新增复用 */
  private async resolveUndertakers(
    db: Prisma.TransactionClient | PrismaService,
    input: UndertakerInput[],
  ): Promise<ResolvedUndertaker[]> {
    return Promise.all(
      input.map(async (u) => {
        if (u.type === 'enterprise') {
          const enterprise = await db.enterprise.findUnique({ where: { id: u.id } })
          if (!enterprise) throw new NotFoundException('承接企业不存在')
          return { type: u.type, refId: u.id, name: enterprise.name, share: u.share }
        }
        if (u.type === 'individual') {
          const user = await db.user.findUnique({ where: { uid: u.id } })
          if (!user) throw new NotFoundException('承接人不存在')
          return { type: u.type, refId: u.id, name: user.nickname, share: u.share }
        }
        return {
          type: u.type,
          refId: u.id,
          name: u.name || u.id,
          share: u.share,
          contactName: u.contactName ?? null,
          phone: u.phone ?? null,
        }
      }),
    )
  }
}

/** 里程碑「责任方」（存承接方展示名，历史口径）按旧承接方 refId → 当前展示名重映射：
 * 旧名能对上旧承接方时改写为当前名（承接方改名场景）；对不上则保留原名（自定义/历史名称） */
function remapOwnerNames(
  owners: string[],
  previous: Array<{ type: string; refId: string; name: string }>,
  nameByRefId: Map<string, string>,
): string[] {
  return owners.map((owner) => {
    const row = previous.find((u) => u.name === owner)
    return row ? nameByRefId.get(`${row.type}:${row.refId}`) ?? owner : owner
  })
}

/* Prisma 行 → Project 形状（refId → id；可选字段缺失省略） */
function toProjectDto(project: ProjectWithRelations): ProjectDto {
  const dto: ProjectDto = {
    id: project.id,
    name: project.name,
    code: project.code,
    undertakers: project.undertakers.map((t) => {
      const u: ProjectUndertakerDto = { type: t.type, id: t.refId, name: t.name, share: t.share }
      if (t.contactName != null) u.contactName = t.contactName
      if (t.phone != null) u.phone = t.phone
      return u
    }),
    status: project.status,
    progress: project.progress,
    startDate: project.startDate,
    endDate: project.endDate,
    initiatedAt: project.initiatedAt,
    description: project.description,
    milestones: project.milestones.map((m) => ({
      id: String(m.id),
      name: m.name,
      status: m.status as MilestoneDto['status'],
      date: m.date,
      owners: m.owners,
    })),
    memberCount: project.memberCount,
  }
  if (project.sourceDemandId != null) dto.sourceDemandId = project.sourceDemandId
  if (project.finishedAt != null) dto.finishedAt = project.finishedAt
  if (project.expReward != null) dto.expReward = project.expReward
  if (project.closeReason != null) dto.closeReason = project.closeReason
  if (project.deletedAt != null) dto.deletedAt = project.deletedAt
  if (project.demanderId != null) dto.demanderId = project.demanderId
  if (project.demanderName != null) dto.demanderName = project.demanderName
  if (project.demanderIdentity != null) dto.demanderIdentity = project.demanderIdentity
  if (project.creatorName != null) dto.creatorName = project.creatorName
  if (project.creatorId != null) dto.creatorId = project.creatorId
  if (project.contactName != null) dto.contactName = project.contactName
  if (project.contactPhone != null) dto.contactPhone = project.contactPhone
  if (project.contactEmail != null) dto.contactEmail = project.contactEmail
  if (project.contractPrice != null) dto.contractPrice = project.contractPrice
  return dto
}
