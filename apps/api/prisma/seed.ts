/* M1-B 种子 — M0 mock 全量迁移（编号与跨模块引用一致，见 docs/wiki-backend.md §11）
 * 在 M1-A 骨架（AdminUser + SystemConfig + DictEntry）之上扩展其余全部实体。
 * 幂等：按 FK 逆序清空后重建。
 * 数据来源：apps/admin/src/mock/*（tsx 运行时加载；mock 的 `import type ... from '@/types'`
 * 为类型导入，运行时被 esbuild 剥离，故 require 可直接命中具名导出）。
 * 注意：api tsconfig 无 '@/*' 路径映射，若用静态 import 会连带解析 '@/types' 导致 tsc 报错，
 * 因此这里用 require（返回 any，tsc 不追踪 mock 文件），运行时由 tsx 正确加载。 */
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

/* eslint-disable @typescript-eslint/no-var-requires */
const { users } = require('../../admin/src/mock/users')
const { enterprises } = require('../../admin/src/mock/enterprises')
const { applications } = require('../../admin/src/mock/applications')
const { demands } = require('../../admin/src/mock/demands')
const { projects } = require('../../admin/src/mock/projects')
const { events } = require('../../admin/src/mock/events')
const { externalEnterpriseProfiles } = require('../../admin/src/mock/externalEnterpriseProfiles')
const { experienceRecords, pointsRecords } = require('../../admin/src/mock/ledgers')
const { goods, pointsRules, redemptionOrders } = require('../../admin/src/mock/mall')
const { experienceRules, levelTiers } = require('../../admin/src/mock/rules')
const { leases, workstationAreas, workstations } = require('../../admin/src/mock/workstations')
const { reservations, spaces } = require('../../admin/src/mock/spaces')
const { articles, columns, showcaseRequests } = require('../../admin/src/mock/contents')
const { notifications } = require('../../admin/src/mock/notifications')
const { auditLogs } = require('../../admin/src/mock/auditLogs')
const { systemConfig } = require('../../admin/src/mock/systemConfig')
const { dicts } = require('../../admin/src/mock/dict')
const { announcements } = require('../../admin/src/mock/announcements')
/* eslint-enable @typescript-eslint/no-var-requires */

/** 取 ID 末尾数字，如 'U1015' -> 1015、'AP3016' -> 3016 */
function numericSuffix(id: string): number {
  const m = id.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

async function main() {
  // ---------- 清空（FK 逆序） ----------
  await prisma.leaseWorkstation.deleteMany()
  await prisma.eventEnrollment.deleteMany()
  await prisma.pointsRecord.deleteMany()
  await prisma.redemptionOrder.deleteMany()
  await prisma.spaceReservation.deleteMany()
  await prisma.article.deleteMany()
  await prisma.workstation.deleteMany()
  await prisma.milestone.deleteMany()
  await prisma.projectUndertaker.deleteMany()
  await prisma.demandRespondent.deleteMany()
  await prisma.userIdentity.deleteMany()
  await prisma.lease.deleteMany()
  await prisma.workstationArea.deleteMany()
  await prisma.demand.deleteMany()
  await prisma.project.deleteMany()
  await prisma.communityEvent.deleteMany()
  await prisma.application.deleteMany()
  await prisma.enterprise.deleteMany()
  await prisma.externalEnterpriseProfile.deleteMany()
  await prisma.user.deleteMany()
  await prisma.experienceRecord.deleteMany()
  await prisma.mallGoods.deleteMany()
  await prisma.pointsRule.deleteMany()
  await prisma.experienceRule.deleteMany()
  await prisma.levelTier.deleteMany()
  await prisma.space.deleteMany()
  await prisma.articleColumn.deleteMany()
  await prisma.showcaseRequest.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.adminNotification.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.idSequence.deleteMany()
  await prisma.dictEntry.deleteMany()
  await prisma.systemConfig.deleteMany()
  await prisma.adminUser.deleteMany()

  const counts: Record<string, number> = {}

  // ---------- 认证与基础设施 ----------
  await prisma.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: await hash('admin123', 10),
      name: '社区管理员',
    },
  })
  counts.AdminUser = 1

  await prisma.systemConfig.create({
    data: {
      id: 1,
      siteName: systemConfig.siteName,
      siteSlogan: systemConfig.siteSlogan,
      registrationOpen: systemConfig.registrationOpen,
      mallOpen: systemConfig.mallOpen,
      demandOpen: systemConfig.demandOpen,
      reservationOpen: systemConfig.reservationOpen,
      dailyLoginPoints: systemConfig.dailyLoginPoints,
      leaseExpireRemindDays: systemConfig.leaseExpireRemindDays,
      updatedAt: systemConfig.updatedAt,
      updatedBy: systemConfig.updatedBy,
    },
  })
  counts.SystemConfig = 1

  for (const [type, entries] of Object.entries(dicts) as Array<[string, Array<{ code: string; label: string; sort: number; status?: string }>]>) {
    await prisma.dictEntry.createMany({
      data: entries.map((e) => ({ type, code: e.code, label: e.label, sort: e.sort, status: e.status ?? 'enabled' })),
    })
    counts.DictEntry = (counts.DictEntry ?? 0) + entries.length
  }

  // ---------- 社区成员 ----------
  let identityCount = 0
  for (const u of users) {
    await prisma.user.create({
      data: {
        uid: u.uid,
        nickname: u.nickname,
        phone: u.phone,
        email: u.email,
        gender: u.gender,
        status: u.status,
        realName: u.realName ?? null,
        citizenId: u.citizenId ?? null,
        wechatOpenid: u.wechatOpenid ?? null,
        wechatUnionid: u.wechatUnionid ?? null,
        wechatVerified: u.wechatVerified ?? false,
        frozenUntil: u.frozenUntil ?? null,
        frozenReason: u.frozenReason ?? null,
        points: u.points,
        registeredAt: u.registeredAt,
        lastActiveAt: u.lastActiveAt,
        bio: u.bio,
        activities: u.activities ?? [],
      },
    })
    for (const ident of u.identities) {
      await prisma.userIdentity.create({
        data: {
          userId: u.uid,
          type: ident.type,
          enterpriseId: ident.enterpriseId ?? null,
          enterpriseName: ident.enterpriseName ?? null,
          role: ident.role ?? null,
          title: ident.title,
          level: ident.level ?? null,
          experience: ident.experience ?? null,
        },
      })
      identityCount += 1
    }
  }
  counts.User = users.length
  counts.UserIdentity = identityCount

  for (const e of enterprises) {
    await prisma.enterprise.create({
      data: {
        id: e.id,
        name: e.name,
        industry: e.industry,
        stage: e.stage,
        size: e.size,
        foundedAt: e.foundedAt,
        settledAt: e.settledAt ?? null,
        leaseType: e.leaseType,
        status: e.status,
        showcaseStatus: e.showcaseStatus,
        showcaseComment: e.showcaseComment ?? null,
        experience: e.experience ?? 0,
        contactName: e.contactName,
        contactPhone: e.contactPhone,
        contactEmail: e.contactEmail ?? null,
        description: e.description,
        tags: e.tags ?? [],
      },
    })
  }
  counts.Enterprise = enterprises.length

  for (const p of externalEnterpriseProfiles) {
    await prisma.externalEnterpriseProfile.create({
      data: {
        id: p.id,
        name: p.name,
        industry: p.industry,
        description: p.description,
        cooperationCount: p.cooperationCount ?? 0,
        firstCooperationAt: p.firstCooperationAt,
      },
    })
  }
  counts.ExternalEnterpriseProfile = externalEnterpriseProfiles.length

  for (const a of applications) {
    await prisma.application.create({
      data: {
        id: a.id,
        type: a.type,
        applicantName: a.applicantName,
        applicantPhone: a.applicantPhone,
        targetName: a.targetName,
        submittedAt: a.submittedAt,
        status: a.status,
        summary: a.summary,
        details: a.details ?? [],
        records: a.records ?? [],
      },
    })
  }
  counts.Application = applications.length

  // ---------- 业务运营域 ----------
  let respondentCount = 0
  for (const d of demands) {
    await prisma.demand.create({
      data: {
        id: d.id,
        title: d.title,
        category: d.category,
        publisherId: d.publisherId ?? '',
        publisherName: d.publisherName,
        publisherIdentity: d.publisherIdentity ?? null,
        contactName: d.contactName ?? null,
        contactPhone: d.contactPhone ?? null,
        contactEmail: d.contactEmail ?? null,
        budget: d.budget,
        period: d.period,
        deadline: d.deadline,
        scheduledAt: d.scheduledAt ?? null,
        visibilityIdentities: d.visibilityIdentities ?? [],
        visibilityLevels: d.visibilityLevels ?? [],
        enrollmentIdentities: d.enrollmentIdentities ?? [],
        enrollmentLevels: d.enrollmentLevels ?? [],
        status: d.status,
        createdAt: d.createdAt,
        publishedAt: d.publishedAt ?? null,
        description: d.description,
        tags: d.tags ?? [],
        rejectedReason: d.rejectedReason ?? null,
        matchedRespondent: d.matchedRespondent ?? null,
        projectId: d.projectId ?? null,
        respondPoints: d.respondPoints ?? null,
      },
    })
    for (const r of d.respondents) {
      await prisma.demandRespondent.create({
        data: {
          demandId: d.id,
          name: r.name,
          enterprise: r.enterprise,
          phone: r.phone ?? null,
          email: r.email ?? null,
          quote: r.quote ?? null,
          message: r.message,
          at: r.at,
          status: r.status ?? 'pending',
        },
      })
      respondentCount += 1
    }
  }
  counts.Demand = demands.length
  counts.DemandRespondent = respondentCount

  let undertakerCount = 0
  let milestoneCount = 0
  for (const p of projects) {
    await prisma.project.create({
      data: {
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        progress: p.progress ?? 0,
        startDate: p.startDate ?? '',
        endDate: p.endDate ?? '',
        initiatedAt: p.initiatedAt,
        description: p.description,
        memberCount: p.memberCount,
        sourceDemandId: p.sourceDemandId ?? null,
        expReward: p.expReward ?? null,
        closeReason: p.closeReason ?? null,
      },
    })
    for (const u of p.undertakers) {
      await prisma.projectUndertaker.create({
        data: {
          projectId: p.id,
          type: u.type,
          refId: u.id ?? '',
          name: u.name,
          share: u.share,
          contactName: u.contactName ?? null,
          phone: u.phone ?? null,
        },
      })
      undertakerCount += 1
    }
    for (const m of p.milestones) {
      await prisma.milestone.create({
        data: {
          projectId: p.id,
          name: m.name,
          status: m.status ?? 'todo',
          date: m.date,
          owners: m.owners ?? [],
        },
      })
      milestoneCount += 1
    }
  }
  counts.Project = projects.length
  counts.ProjectUndertaker = undertakerCount
  counts.Milestone = milestoneCount

  let enrollmentCount = 0
  for (const ev of events) {
    await prisma.communityEvent.create({
      data: {
        id: ev.id,
        createdAt: ev.createdAt ?? '',
        title: ev.title,
        type: ev.type,
        startTime: ev.startTime,
        endTime: ev.endTime,
        location: ev.location,
        capacity: ev.capacity,
        speaker: ev.speaker,
        host: ev.host,
        status: ev.status,
        enrollmentOpen: ev.enrollmentOpen ?? false,
        visibilityIdentities: ev.visibilityIdentities ?? [],
        visibilityLevels: ev.visibilityLevels ?? [],
        enrollmentIdentities: ev.enrollmentIdentities ?? [],
        enrollmentLevels: ev.enrollmentLevels ?? [],
        requireReview: ev.requireReview ?? false,
        enrollmentDeadline: ev.enrollmentDeadline ?? null,
        scheduledAt: ev.scheduledAt ?? null,
        enrollPoints: ev.enrollPoints ?? null,
        checkinPoints: ev.checkinPoints ?? null,
        description: ev.description,
        tags: ev.tags ?? [],
      },
    })
    for (const en of ev.enrollments) {
      await prisma.eventEnrollment.create({
        data: {
          eventId: ev.id,
          userId: en.userId,
          name: en.name,
          enterprise: en.enterprise,
          phone: en.phone,
          appliedAt: en.appliedAt,
          status: en.status ?? 'pending',
          checkedIn: en.checkedIn ?? false,
          checkInAt: en.checkInAt ?? null,
        },
      })
      enrollmentCount += 1
    }
  }
  counts.CommunityEvent = events.length
  counts.EventEnrollment = enrollmentCount

  // ---------- 账本 ----------
  for (const r of experienceRecords) {
    await prisma.experienceRecord.create({
      data: {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        delta: r.delta,
        balance: r.balance,
        reason: r.reason,
        at: r.at,
        operator: r.operator,
        source: r.source,
      },
    })
  }
  counts.ExperienceRecord = experienceRecords.length

  for (const r of pointsRecords) {
    await prisma.pointsRecord.create({
      data: {
        id: r.id,
        userId: r.userId,
        delta: r.delta,
        balance: r.balance,
        reason: r.reason,
        at: r.at,
        operator: r.operator,
        source: r.source,
      },
    })
  }
  counts.PointsRecord = pointsRecords.length

  // ---------- 积分商城与规则 ----------
  for (const g of goods) {
    await prisma.mallGoods.create({
      data: {
        id: g.id,
        name: g.name,
        category: g.category,
        points: g.points,
        stock: g.stock,
        status: g.status ?? 'on',
        description: g.description,
        redeemedCount: g.redeemedCount ?? 0,
        createdAt: g.createdAt,
      },
    })
  }
  counts.MallGoods = goods.length

  for (const o of redemptionOrders) {
    await prisma.redemptionOrder.create({
      data: {
        id: o.id,
        userId: o.userId,
        userName: o.userName,
        goodsId: o.goodsId,
        goodsName: o.goodsName,
        points: o.points,
        status: o.status,
        createdAt: o.createdAt,
        shippedAt: o.shippedAt ?? null,
        finishedAt: o.finishedAt ?? null,
        recipientName: o.recipientName ?? null,
        recipientPhone: o.recipientPhone ?? null,
        address: o.address ?? null,
        note: o.note ?? null,
        cancelReason: o.cancelReason ?? null,
      },
    })
  }
  counts.RedemptionOrder = redemptionOrders.length

  for (const r of pointsRules) {
    await prisma.pointsRule.create({
      data: {
        code: r.code,
        name: r.name,
        scene: r.scene,
        points: r.points,
        status: r.status ?? 'enabled',
        description: r.description ?? null,
        updatedAt: r.updatedAt,
      },
    })
  }
  counts.PointsRule = pointsRules.length

  for (const r of experienceRules) {
    await prisma.experienceRule.create({
      data: {
        code: r.code,
        name: r.name,
        scene: r.scene,
        exp: r.exp,
        status: r.status ?? 'enabled',
        description: r.description ?? null,
        updatedAt: r.updatedAt,
      },
    })
  }
  counts.ExperienceRule = experienceRules.length

  for (const t of levelTiers) {
    await prisma.levelTier.create({
      data: { level: t.level, label: t.label, threshold: t.threshold },
    })
  }
  counts.LevelTier = levelTiers.length

  // ---------- 空间管理 ----------
  for (const a of workstationAreas) {
    await prisma.workstationArea.create({
      data: {
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
        createdAt: a.createdAt,
      },
    })
  }
  counts.WorkstationArea = workstationAreas.length

  // mock 工位以「区域名」关联（M1 改 areaId 外键）
  const areaIdByName = new Map<string, string>(workstationAreas.map((a: any) => [a.name, a.id]))
  for (const w of workstations) {
    await prisma.workstation.create({
      data: {
        id: w.id,
        seatNo: w.seatNo,
        areaId: areaIdByName.get(w.area) ?? '',
        type: w.type,
        capacity: w.capacity,
        status: w.status ?? 'idle',
        enterpriseId: w.enterpriseId ?? null,
        enterpriseName: w.enterpriseName ?? null,
        leaseId: w.leaseId ?? null,
        defaultMonthlyRent: w.defaultMonthlyRent ?? null,
        areaSqm: w.areaSqm ?? null,
        note: w.note ?? null,
      },
    })
  }
  counts.Workstation = workstations.length

  for (const l of leases) {
    await prisma.lease.create({
      data: {
        id: l.id,
        renterId: l.enterpriseId ?? '',
        renterName: l.enterpriseName,
        renterType: (l.enterpriseId ?? '').startsWith('U') ? 'individual' : 'enterprise',
        startDate: l.startDate,
        endDate: l.endDate ?? '',
        longTerm: l.longTerm ?? false,
        status: l.status,
        monthlyRent: l.monthlyRent,
        rentPeriod: l.rentPeriod ?? 'month',
        contactName: l.contactName,
        contactPhone: l.contactPhone,
        terminatedAt: l.terminatedAt ?? null,
      },
    })
    for (const wsId of l.workstationIds ?? []) {
      await prisma.leaseWorkstation.create({
        data: { leaseId: l.id, workstationId: wsId },
      })
    }
  }
  counts.Lease = leases.length
  counts.LeaseWorkstation = leases.reduce((n: number, l: any) => n + (l.workstationIds?.length ?? 0), 0)

  for (const s of spaces) {
    await prisma.space.create({
      data: {
        id: s.id,
        name: s.name,
        type: s.type,
        capacity: s.capacity,
        location: s.location,
        openTime: s.openTime,
        closeTime: s.closeTime,
        allDay: s.allDay ?? false,
        needReservation: s.needReservation ?? false,
        needApproval: s.needApproval ?? false,
        equipment: s.equipment ?? [],
        status: s.status ?? 'available',
        description: s.description,
      },
    })
  }
  counts.Space = spaces.length

  for (const r of reservations) {
    await prisma.spaceReservation.create({
      data: {
        id: r.id,
        userId: r.userId,
        userName: r.userName,
        phone: r.phone,
        spaceId: r.spaceId,
        spaceName: r.spaceName,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        purpose: r.purpose,
        attendees: r.attendees,
        status: r.status,
        submittedAt: r.submittedAt,
        records: r.records ?? [],
        rejectReason: r.rejectReason ?? null,
      },
    })
  }
  counts.SpaceReservation = reservations.length

  // ---------- 内容管理 ----------
  for (const c of columns) {
    await prisma.articleColumn.create({
      data: {
        id: c.id,
        name: c.name,
        description: c.description,
        sort: c.sort,
        status: c.status ?? 'enabled',
        createdAt: c.createdAt,
      },
    })
  }
  counts.ArticleColumn = columns.length

  for (const a of articles) {
    await prisma.article.create({
      data: {
        id: a.id,
        title: a.title,
        columnId: a.columnId,
        columnName: a.columnName,
        authorId: a.authorId,
        authorName: a.authorName,
        authorIdentity: a.authorIdentity ?? null,
        status: a.status,
        publishedAt: a.publishedAt ?? null,
        views: a.views ?? 0,
        summary: a.summary,
        tags: a.tags ?? [],
        createdAt: a.createdAt,
        rejectedReason: a.rejectedReason ?? null,
      },
    })
  }
  counts.Article = articles.length

  for (const s of showcaseRequests) {
    await prisma.showcaseRequest.create({
      data: {
        id: s.id,
        targetType: s.targetType,
        targetId: s.targetId ?? null,
        targetName: s.targetName,
        contentSummary: s.contentSummary,
        submitterName: s.submitterName,
        submitterPhone: s.submitterPhone,
        submittedAt: s.submittedAt,
        status: s.status,
        records: s.records ?? [],
        rejectReason: s.rejectReason ?? null,
      },
    })
  }
  counts.ShowcaseRequest = showcaseRequests.length

  for (const a of announcements) {
    await prisma.announcement.create({
      data: {
        id: a.id,
        title: a.title,
        content: a.content,
        pinned: a.pinned ?? false,
        status: a.status ?? 'published',
        publishedAt: a.publishedAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt ?? null,
      },
    })
  }
  counts.Announcement = announcements.length

  // ---------- 系统管理 ----------
  for (const n of notifications) {
    await prisma.adminNotification.create({
      data: {
        id: n.id,
        type: n.type,
        title: n.title,
        content: n.content,
        at: n.at,
        read: n.read ?? false,
        link: n.link ?? null,
      },
    })
  }
  counts.AdminNotification = notifications.length

  for (const l of auditLogs) {
    await prisma.auditLog.create({
      data: {
        id: l.id,
        operator: l.operator,
        module: l.module,
        action: l.action,
        target: l.target,
        detail: l.detail ?? null,
        at: l.at,
      },
    })
  }
  counts.AuditLog = auditLogs.length

  // ---------- ID 序列（nextNumber = 各前缀当前最大数字后缀；next() 会自增后取号） ----------
  const idSeeds: Array<[string, string[]]> = [
    ['U', users.map((x: any) => x.uid)],
    ['E', enterprises.map((x: any) => x.id)],
    ['AP', applications.map((x: any) => x.id)],
    ['D', demands.map((x: any) => x.id)],
    ['P', projects.map((x: any) => x.id)],
    ['EV', events.map((x: any) => x.id)],
    ['XE', externalEnterpriseProfiles.map((x: any) => x.id)],
    ['EX', experienceRecords.map((x: any) => x.id)],
    ['PT', pointsRecords.map((x: any) => x.id)],
    ['G', goods.map((x: any) => x.id)],
    ['RO', redemptionOrders.map((x: any) => x.id)],
    ['WS', workstations.map((x: any) => x.id)],
    ['WA', workstationAreas.map((x: any) => x.id)],
    ['LS', leases.map((x: any) => x.id)],
    ['S', spaces.map((x: any) => x.id)],
    ['SR', reservations.map((x: any) => x.id)],
    ['A', articles.map((x: any) => x.id)],
    ['CL', columns.map((x: any) => x.id)],
    ['SC', showcaseRequests.map((x: any) => x.id)],
    ['AN', announcements.map((x: any) => x.id)],
    ['N', notifications.map((x: any) => x.id)],
    ['AL', auditLogs.map((x: any) => x.id)],
  ]
  for (const [prefix, ids] of idSeeds) {
    const nextNumber = ids.reduce((max, id) => Math.max(max, numericSuffix(id)), 0)
    await prisma.idSequence.upsert({
      where: { entityType: prefix },
      create: { entityType: prefix, nextNumber },
      update: { nextNumber },
    })
  }
  counts.IdSequence = idSeeds.length

  // ---------- 汇总 ----------
  console.log('[seed] 写入完成，实体计数：')
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name} = ${count}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
