/* M1-B 种子 — M0 mock 全量迁移（编号与跨模块引用一致，见 docs/wiki-backend.md §11）
 * 在 M1-A 骨架（AdminUser + SystemConfig + DictEntry）之上扩展其余全部实体。
 * 幂等：按 FK 逆序清空后重建。
 * 数据来源：prisma/seed-data/*（M1-E 自 admin mock 内化的种子数据；`import type ... from '@/types'`
 * 为类型导入，运行时被 esbuild 剥离，故 require 可直接命中具名导出）。
 * 注意：api tsconfig 无 '@/*' 路径映射，若用静态 import 会连带解析 '@/types' 导致 tsc 报错，
 * 因此这里用 require（返回 any，tsc 不追踪数据文件），运行时由 tsx 正确加载；
 * seed-data 目录已在 tsconfig exclude 中排除（M1-E 起 admin mock 已删除，此处为唯一数据源）。 */
import { PrismaClient, Prisma } from '@prisma/client'
import { levelPublishingLimitSeeds, personalPublishingLimitSeeds } from './seed-data/engagement'
import { hash } from 'bcryptjs'
import Redis from 'ioredis'
import { APP_CACHE_KEYS } from '../src/common/redis/cache-keys'

const prisma = new PrismaClient()

/* 清理应用缓存键（wiki-backend.md §10）：重种子后避免读到旧缓存；Redis 不可用时静默跳过，不阻断种子 */
async function clearAppCache(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 2000,
  })
  try {
    await redis.connect()
    await redis.del(...APP_CACHE_KEYS)
    /* 动态鉴权缓存（按用户名/验证码分片）一并清理，避免重种子后读到旧权限 */
    const dynamicKeys = [
      ...(await redis.keys('auth:admin:perms:*')),
      ...(await redis.keys('auth:admin:profile:*')),
      ...(await redis.keys('captcha:*')),
      'auth:admin:sessions',
    ]
    // Each serial e2e suite gets a fresh rate window; ordinary seed keeps production limits intact.
    if (process.env.E2E_SEED_RESET_RATES === '1') {
      dynamicKeys.push(
        ...await redis.keys('auth:app:captcha:rate:*'),
        /* 验证码频控与待消费验证码（短信/邮箱/找回密码）一并清理，避免跨套件累计触发 429 */
        ...await redis.keys('sms:*'),
        ...await redis.keys('email:*'),
        ...await redis.keys('auth:app:reset:rate:*'),
      )
    }
    if (dynamicKeys.length > 0) await redis.del(...dynamicKeys)
    console.log(`[seed] 应用缓存已清理（${APP_CACHE_KEYS.length + dynamicKeys.length} 键）`)
  } catch (e) {
    console.warn('[seed] 缓存清理跳过（Redis 不可用）:', e instanceof Error ? e.message : e)
  } finally {
    redis.disconnect()
  }
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { users } = require('./seed-data/users')
const { enterprises } = require('./seed-data/enterprises')
const { applications } = require('./seed-data/applications')
const { demands } = require('./seed-data/demands')
const { projects } = require('./seed-data/projects')
const { events } = require('./seed-data/events')
const { externalEnterpriseProfiles } = require('./seed-data/externalEnterpriseProfiles')
const { experienceRecords, pointsRecords } = require('./seed-data/ledgers')
const { goods, pointsRules, redemptionOrders } = require('./seed-data/mall')
const { experienceRules, levelTiers } = require('./seed-data/rules')
const { leases, workstationAreas, workstations } = require('./seed-data/workstations')
const { reservations, spaces } = require('./seed-data/spaces')
const { articles, columns } = require('./seed-data/contents')
const { notifications } = require('./seed-data/notifications')
const { auditLogs } = require('./seed-data/auditLogs')
const { systemConfig } = require('./seed-data/systemConfig')
const { messageChannels, messageTemplates, messageTemplateVersions } = require('./seed-data/messaging')
const { dicts } = require('./seed-data/dict')
const { announcements } = require('./seed-data/announcements')
const { banners } = require('./seed-data/banners')
const { adminAccounts, adminRoles, permissionCatalog } = require('./seed-data/rbac')
/* eslint-enable @typescript-eslint/no-var-requires */

/* 取 ID 末尾数字，如 'U1015' -> 1015、'AP3016' -> 3016 */
function numericSuffix(id: string): number {
  const m = id.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

/* M2-R R3：社区个体个人名片 seed（uid → 名片；免审保存即公开） */
const individualCardSeeds: Record<string, Record<string, unknown>> = {
  U1005: {
    intro: '独立设计师，专注品牌视觉与产品界面，服务过 20+ 初创团队。',
    industryExperience: '品牌设计 / UI·UX（8 年）',
    skills: ['品牌视觉', 'UI/UX', '设计系统', '插画'],
    age: 32,
    politicalStatus: '群众',
    education: [{ school: '中国美术学院', major: '视觉传达', degree: '本科', period: '2012-2016' }],
    work: [{ company: '独立执业', title: '品牌设计师', period: '2019 至今', description: '服务初创团队品牌与产品界面设计。' }],
    projects: [{ name: '聚屿社区品牌焕新', role: '主创', period: '2025', description: '社区 Logo 与视觉规范。' }],
    honors: [{ name: '站酷设计奖', date: '2023' }],
    socials: [{ label: 'Behance', url: 'https://behance.net/gubeichen' }],
    customLinks: [],
    updatedAt: '2026-08-20 10:00',
  },
  U1012: {
    intro: '全栈工程师，偏前端架构与工程效能，常驻社区技术沙龙讲师。',
    industryExperience: 'Web 全栈（6 年）',
    skills: ['TypeScript', 'Vue/React', 'Node.js', '工程化'],
    age: 29,
    politicalStatus: '党员',
    education: [{ school: '浙江大学', major: '软件工程', degree: '硕士', period: '2015-2018' }],
    work: [{ company: '深空航天科技', title: '高级前端工程师', period: '2021 至今' }],
    projects: [{ name: '社区小程序联营', role: '技术负责人', period: '2026' }],
    honors: [],
    socials: [],
    customLinks: [{ label: '个人博客', url: 'https://blog.qinlang.dev' }],
    updatedAt: '2026-08-25 14:00',
  },
}

/* M2-R R3：政策与协议 seed（agreement_* 供注册/设置页版本化下发；community 供社区政策列表） */
const policySeeds: Array<Record<string, unknown>> = [
  {
    id: 'PL1001', kind: 'agreement_user', category: '-', title: '聚屿社区用户协议',
    summary: '社区用户权利义务与行为规范', version: '1.0',
    content: '欢迎使用聚屿社区。本协议约定账号注册、身份管理、内容发布、积分商城与活动报名等场景下用户与平台双方的权利义务。用户应遵守法律法规与社区公序良俗，不得发布违法违规内容；平台有权对违规行为采取驳回、屏蔽、封禁等措施。',
    effectiveAt: '2026-01-01', publisher: '聚屿社区', status: 'published',
    publishedAt: '2026-01-01 00:00', updatedAt: '2026-01-01 00:00',
  },
  {
    id: 'PL1002', kind: 'agreement_privacy', category: '-', title: '聚屿社区隐私政策',
    summary: '个人信息收集、使用与保护说明', version: '1.0',
    content: '我们仅在为您提供社区服务所必需的范围内收集个人信息（联系信息、实名信息、简历内容等），并采取加密与访问控制保护数据安全。未经您的同意，我们不会向第三方共享可识别个人身份的信息，法律法规另有规定的除外。',
    effectiveAt: '2026-01-01', publisher: '聚屿社区', status: 'published',
    publishedAt: '2026-01-01 00:00', updatedAt: '2026-01-01 00:00',
  },
  {
    id: 'PL2001', kind: 'community', category: '人才政策', title: '社区人才登记与分级权益指引',
    summary: '人才登记流程、实名分级与对应权益说明', version: '2.0',
    content: '一、人才登记：完成个人名片填写并通过社区个体身份审核后进入社区人才库。\n二、实名分级：未实名用户可浏览与基础互动；完成实名认证后可提升发布与报名额度，并解锁企业对接优先推荐。\n三、权益明细以「我的-实名认证」页实时下发为准。',
    effectiveAt: '2026-09-01', publisher: '聚屿社区运营部', status: 'published', featured: true,
    publishedAt: '2026-09-01 10:00', updatedAt: '2026-09-01 10:00',
  },
  {
    id: 'PL2002', kind: 'community', category: '入驻指南', title: '企业入驻与办公空间申请指引',
    summary: '从提交申请到入驻办公的全流程说明', version: '1.2',
    content: '一、提交入驻申请（营业执照等材料）。\n二、运营审核（3 个工作日内反馈）。\n三、签署入驻协议并办理办公位/办公室租赁。\n四、公共空间预约需提前一个工作日提交，路演厅需提前三个工作日并附活动方案。',
    effectiveAt: '2026-08-15', publisher: '聚屿社区运营部', status: 'published',
    publishedAt: '2026-08-15 09:00', updatedAt: '2026-08-15 09:00',
  },
  {
    id: 'PL2003', kind: 'community', category: '补贴申报', title: '2026 年度创业补贴申报通知',
    summary: '补贴对象、标准与申报材料清单', version: '1.0',
    content: '申报对象：完成社区企业入驻且正常运营满 6 个月的团队。补贴标准：按实际租金的 30% 给予年度补贴，上限 5 万元。申报材料：营业执照、租赁合同、纳税证明。申报截止：2026-11-30。',
    effectiveAt: '2026-09-10', publisher: '聚屿社区运营部', status: 'published',
    publishedAt: '2026-09-10 10:00', updatedAt: '2026-09-10 10:00',
  },
]

async function main() {
  // ---------- 清空（FK 逆序） ----------
  await prisma.applicationFormConfig.deleteMany()
  await prisma.analyticsEvent.deleteMany()
  await prisma.publishingLimitUsage.deleteMany()
  await prisma.publishingLimitRule.deleteMany()
  await prisma.cardFieldConfig.deleteMany()
  await prisma.publishingLimitRule.createMany({ data: [
    ...personalPublishingLimitSeeds,
    ...levelPublishingLimitSeeds('community_individual', levelTiers.filter((t: { identityType: string }) => t.identityType === 'community_individual').map((t: { level: number }) => t.level)),
    ...levelPublishingLimitSeeds('community_enterprise', levelTiers.filter((t: { identityType: string }) => t.identityType === 'community_enterprise').map((t: { level: number }) => t.level)),
  ] })
  await prisma.cardFieldConfig.createMany({ data: [
    { type: 'individual', editableFields: ['displayName', 'age', 'politicalStatus', 'intro', 'industryExperience', 'skills', 'education', 'work', 'projects', 'honors', 'socials', 'customLinks', 'visibility'], updatedAt: '2026-09-17 00:00', updatedBy: '系统初始化' },
    { type: 'enterprise', editableFields: ['logo', 'industry', 'size', 'foundedAt', 'website', 'address', 'description', 'services', 'advantages'], updatedAt: '2026-09-17 00:00', updatedBy: '系统初始化' },
  ] })
  await prisma.leaseWorkstation.deleteMany()
  await prisma.eventEnrollment.deleteMany()
  /* M2-R R2/R3：无 FK 的挂靠表（userId/eventId/goodsId 仅为字符串列，不随主表级联，必须显式清理防跨 reseed 残留） */
  await prisma.eventFeedback.deleteMany()
  await prisma.favorite.deleteMany()
  await prisma.pointsRecord.deleteMany()
  /* M2-R R1 新增表（挂靠 user 的可变状态；必须随 User 一起清，避免孤儿残留导致 next 重号 P2002） */
  await prisma.userNotification.deleteMany()
  await prisma.agreementConsent.deleteMany()
  await prisma.accountDeletionRequest.deleteMany()
  /* M2-R R3 新增表 */
  await prisma.transferRequest.deleteMany()
  await prisma.enterpriseInvitation.deleteMany()
  await prisma.policy.deleteMany()
  await prisma.individualCard.deleteMany()
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
  await prisma.announcement.deleteMany()
  await prisma.adminNotification.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.idSequence.deleteMany()
  await prisma.dictEntry.deleteMany()
  await prisma.systemConfig.deleteMany()
  await prisma.archiveSetting.deleteMany()
  await prisma.adminUserRole.deleteMany()
  await prisma.adminRolePermission.deleteMany()
  await prisma.adminRole.deleteMany()
  await prisma.adminPermission.deleteMany()
  await prisma.loginLog.deleteMany()
  await prisma.schedulerLog.deleteMany()
  await prisma.mallAsset.deleteMany()
  await prisma.adminUser.deleteMany()

  const counts: Record<string, number> = {}

  /* P0 消息中心：渠道配置 / 模板中心（凭据仅登记环境变量名，不落库明文） */
  await prisma.messageDeliveryLog.deleteMany()
  await prisma.outboxMessage.deleteMany()
  await prisma.messageTemplateVersion.deleteMany()
  await prisma.messageTemplate.deleteMany()
  await prisma.messageChannel.deleteMany()
  await prisma.contactConsent.deleteMany()
  await prisma.messageChannel.createMany({ data: messageChannels })
  await prisma.messageTemplate.createMany({ data: messageTemplates })
  await prisma.messageTemplateVersion.createMany({ data: messageTemplateVersions })
  counts.MessageChannel = messageChannels.length
  counts.MessageTemplate = messageTemplates.length
  counts.MessageTemplateVersion = messageTemplateVersions.length

  // ---------- 认证与基础设施 ----------
  // RBAC 权限点目录 + 角色 + 角色权限 + 管理员账号（R1/R2）
  for (const p of permissionCatalog) {
    await prisma.adminPermission.create({
      data: { code: p.code, name: p.name, module: p.module, authType: p.authType, sort: p.sort },
    })
  }
  counts.AdminPermission = permissionCatalog.length

  for (const r of adminRoles) {
    await prisma.adminRole.create({
      data: {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        sort: r.sort,
        dataScope: r.dataScope ?? [],
        createdAt: '2026-09-01 10:00',
      },
    })
    for (const code of r.permCodes) {
      await prisma.adminRolePermission.create({ data: { roleId: r.id, permissionCode: code } })
    }
  }
  counts.AdminRole = adminRoles.length

  const roleIdByCode = new Map(adminRoles.map((r: { code: string; id: string }) => [r.code, r.id]))
  for (const a of adminAccounts) {
    const created = await prisma.adminUser.create({
      data: {
        username: a.username,
        passwordHash: await hash(a.password, 10),
        name: a.name,
        status: a.status,
        lastLoginAt: null,
        passwordUpdatedAt: '2026-09-01 10:00',
      },
    })
    for (const roleCode of a.roleCodes) {
      await prisma.adminUserRole.create({
        data: { adminUserId: created.id, roleId: roleIdByCode.get(roleCode) as string },
      })
    }
  }
  counts.AdminUser = adminAccounts.length

  await prisma.systemConfig.create({
    data: {
      id: 1,
      siteName: systemConfig.siteName,
      siteSlogan: systemConfig.siteSlogan,
      registrationOpen: systemConfig.registrationOpen,
      mallOpen: systemConfig.mallOpen,
      demandOpen: systemConfig.demandOpen,
      reservationOpen: systemConfig.reservationOpen,
      homeCarouselOpen: systemConfig.homeCarouselOpen,
      leaseExpireRemindDays: systemConfig.leaseExpireRemindDays,
      uploadMaxSizeMb: systemConfig.uploadMaxSizeMb,
      passwordExpireDays: systemConfig.passwordExpireDays,
      minioEnabled: systemConfig.minioEnabled,
      minioEndpoint: systemConfig.minioEndpoint,
      minioPort: systemConfig.minioPort,
      minioUseSsl: systemConfig.minioUseSsl,
      minioAccessKey: systemConfig.minioAccessKey,
      minioSecretKey: systemConfig.minioSecretKey,
      minioBucket: systemConfig.minioBucket,
      realnameRequired: systemConfig.realnameRequired,
      updatedAt: systemConfig.updatedAt,
      updatedBy: systemConfig.updatedBy,
    },
  })
  counts.SystemConfig = 1

  // 归档设置：各标签页默认关闭自动归档/自动删除（企业标签页不支持自动归档）
  for (const domain of [
    'enterprise',
    'externalEnterprise',
    'article',
    'submission',
    'announcement',
    'demand',
    'project',
    'event',
    'lease',
    'reservation',
    'goods',
    'order',
    'application',
    'userMessage',
  ]) {
    await prisma.archiveSetting.create({ data: { domain } })
  }
  counts.ArchiveSetting = 14

  for (const [type, entries] of Object.entries(dicts) as Array<[string, Array<{ code: string; label: string; sort: number; status?: string }>]>) {
    await prisma.dictEntry.createMany({
      data: entries.map((e) => ({ type, code: e.code, label: e.label, sort: e.sort, status: e.status ?? 'enabled' })),
    })
    counts.DictEntry = (counts.DictEntry ?? 0) + entries.length
  }

  // ---------- 社区成员 ----------
  /* M2-R R1：seed 用户统一登录密码 user123（app 端 /api/app/auth/login 用） */
  const APP_DEFAULT_PASSWORD = await hash('user123', 10)
  let identityCount = 0
  for (const u of users) {
    await prisma.user.create({
      data: {
        uid: u.uid,
        /* 用户名：与迁移回填同口径（user_ + 小写 uid），全站唯一 */
        username: u.username ?? `user_${String(u.uid).toLowerCase()}`,
        nickname: u.nickname,
        phone: u.phone ?? null,
        email: u.email ?? null,
        /* 种子用户的手机号/邮箱均视为已验证的可信通知渠道 */
        phoneVerifiedAt: u.phone ? u.registeredAt : null,
        emailVerifiedAt: u.email ? u.registeredAt : null,
        gender: u.gender,
        status: u.status,
        realName: u.realName ?? null,
        citizenId: u.citizenId ?? null,
        verifiedAt: u.realName && u.citizenId ? u.registeredAt : null,
        wechatOpenid: u.wechatOpenid ?? null,
        wechatUnionid: u.wechatUnionid ?? null,
        wechatVerified: u.wechatVerified ?? false,
        frozenUntil: u.frozenUntil ?? null,
        frozenReason: u.frozenReason ?? null,
        passwordHash: APP_DEFAULT_PASSWORD,
        passwordUpdatedAt: u.registeredAt,
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
          /* M2-R R3：成员 8 项权限与联系电话（负责人隐式全量，seed 仅给成员示例） */
          permissions: ident.permissions ?? [],
          memberPhone: ident.memberPhone ?? null,
          level: ident.level ?? null,
          experience: ident.experience ?? null,
        },
      })
      identityCount += 1
    }
    /* M2-R R3：社区个体个人名片（免审保存即公开；seed 给两位社区个体配简历） */
    const cardSeed = individualCardSeeds[u.uid] as Record<string, unknown> | undefined
    if (cardSeed) {
      await prisma.individualCard.create({
        data: {
          userId: u.uid,
          displayName: (cardSeed.displayName as string) ?? u.realName ?? u.nickname,
          intro: cardSeed.intro as string,
          industryExperience: (cardSeed.industryExperience as string) ?? null,
          skills: (cardSeed.skills as string[]) ?? [],
          age: (cardSeed.age as number) ?? null,
          politicalStatus: (cardSeed.politicalStatus as string) ?? null,
          education: (cardSeed.education ?? []) as Prisma.InputJsonValue,
          work: (cardSeed.work ?? []) as Prisma.InputJsonValue,
          projects: (cardSeed.projects ?? []) as Prisma.InputJsonValue,
          honors: (cardSeed.honors ?? []) as Prisma.InputJsonValue,
          socials: (cardSeed.socials ?? []) as Prisma.InputJsonValue,
          customLinks: (cardSeed.customLinks ?? []) as Prisma.InputJsonValue,
          visibility: (cardSeed.visibility ?? { age: true, politicalStatus: true }) as Prisma.InputJsonValue,
          updatedAt: cardSeed.updatedAt ?? u.registeredAt,
        },
      })
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
        size: e.size,
        foundedAt: e.foundedAt,
        settledAt: e.settledAt ?? null,
        leaseType: e.leaseType,
        status: e.status,
        experience: e.experience ?? 0,
        contactUserId: e.contactUserId ?? null,
        contactTitle: e.contactTitle ?? '',
        contactName: e.contactName,
        contactPhone: e.contactPhone,
        contactEmail: e.contactEmail ?? null,
        description: e.description,
        /* M2-R R3：企业名片字段 */
        logo: e.logo ?? null,
        website: e.website ?? null,
        address: e.address ?? null,
        services: e.services ?? [],
        advantages: e.advantages ?? [],
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
        status: p.status ?? 'active',
        size: p.size ?? '',
        foundedAt: p.foundedAt ?? '',
        description: p.description,
        registeredAt: p.registeredAt,
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
        /* 归属「我的申请」按 uid：按申请人手机号回填注册用户 */
        userId: users.find((u: any) => u.phone === a.applicantPhone)?.uid ?? null,
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
        demandType: d.demandType ?? 'task',
        deliverable: d.deliverable ?? null,
        deliverBy: d.deliverBy ?? null,
        cooperationNeed: d.cooperationNeed ?? null,
        returnOffer: d.returnOffer ?? null,
        bottleneck: d.bottleneck ?? null,
        partnershipMode: d.partnershipMode ?? null,
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
          /* 归属「我的响应」按 uid：种子响应数据无 phone，以响应者姓名回填注册用户（企业身份响应无对应个人用户时保持 null） */
          userId: users.find((u: { realName?: string; nickname: string }) => u.realName === r.name || u.nickname === r.name)?.uid ?? null,
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
        finishedAt: p.finishedAt ?? null,
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
          attachments: m.attachments ?? [],
          returnReason: m.returnReason ?? null,
          submitAt: m.submitAt ?? null,
          acceptAt: m.acceptAt ?? null,
          returnedAt: m.returnedAt ?? null,
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
        coverUrl: ev.coverUrl ?? null,
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
        venueLat: ev.venueLat ?? null,
        venueLng: ev.venueLng ?? null,
        checkinRadiusM: ev.checkinRadiusM ?? 200,
        checkinOpenMin: ev.checkinOpenMin ?? 30,
        checkinCloseMin: ev.checkinCloseMin ?? 30,
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
          waitlisted: en.waitlisted ?? false,
          waitlistOrder: en.waitlistOrder ?? null,
          checkinLat: en.checkinLat ?? null,
          checkinLng: en.checkinLng ?? null,
          checkinMethod: en.checkinMethod ?? null,
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
    /* 统一券码兑换：category 为 goods_category 字典分类（GC code），下单即签发券码 */
    await prisma.mallGoods.create({
      data: {
        id: g.id,
        name: g.name,
        coverUrl: g.coverUrl ?? null,
        category: g.category,
        points: g.points,
        stock: g.stock,
        status: g.status ?? 'on',
        description: g.description,
        redeemedCount: g.redeemedCount ?? 0,
        validDays: g.validDays ?? null,
        visibilityIdentities: g.visibilityIdentities ?? [],
        visibilityLevels: g.visibilityLevels ?? [],
        orderIdentities: g.orderIdentities ?? [],
        orderLevels: g.orderLevels ?? [],
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
        finishedAt: o.finishedAt ?? null,
        voucherCode: o.voucherCode,
        voucherExpiresAt: o.voucherExpiresAt,
        usedAt: o.usedAt ?? null,
        cancelledAt: o.cancelledAt ?? null,
        rating: o.rating ?? null,
        reviewComment: o.reviewComment ?? null,
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
      data: { identityType: t.identityType, level: t.level, label: t.label, threshold: t.threshold },
    })
  }
  const resolveLevel = (tiers: Array<{ level: number; threshold: number }>, experience: number) =>
    [...tiers].sort((a, b) => b.threshold - a.threshold).find((tier) => tier.threshold <= experience)?.level ?? 1
  const individualTiers = levelTiers.filter((tier: { identityType: string }) => tier.identityType === 'community_individual')
  const enterpriseTiers = levelTiers.filter((tier: { identityType: string }) => tier.identityType === 'community_enterprise')
  for (const identity of await prisma.userIdentity.findMany({ where: { type: 'community_individual' }, select: { id: true, experience: true } })) {
    await prisma.userIdentity.update({ where: { id: identity.id }, data: { level: resolveLevel(individualTiers, identity.experience ?? 0) } })
  }
  for (const enterprise of await prisma.enterprise.findMany({ select: { id: true, experience: true } })) {
    await prisma.userIdentity.updateMany({
      where: { type: 'community_enterprise', enterpriseId: enterprise.id },
      data: { experience: enterprise.experience, level: resolveLevel(enterpriseTiers, enterprise.experience) },
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

  // mock 办公位以「区域名」关联（M1 改 areaId 外键）
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
        renterType: l.renterType ?? ((l.enterpriseId ?? '').startsWith('U') ? 'individual' : (l.enterpriseId ? 'enterprise' : 'custom')),
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
        maxHours: s.maxHours ?? 4,
        advanceDays: s.advanceDays ?? 30,
        openHours: s.openHours ?? [{ start: s.openTime, end: s.closeTime }],
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
        identityType: r.identityType ?? null,
        subjectName: r.subjectName ?? null,
        asEnterpriseId: r.asEnterpriseId ?? null,
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
        submissionOpen: c.submissionOpen ?? true,
        system: c.system ?? false,
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
        channel: a.channel ?? 'submitted',
        columnId: a.columnId,
        columnName: a.columnName,
        commentsEnabled: a.commentsEnabled ?? true,
        authorId: a.authorId ?? null,
        authorName: a.authorName,
        authorIdentity: a.authorIdentity ?? null,
        status: a.status,
        content: a.content ?? '',
        scheduledAt: a.scheduledAt ?? null,
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
        expireAt: a.expireAt ?? null,
        link: a.link ?? null,
      },
    })
  }
  counts.Announcement = announcements.length

  /* 首页轮播图（内容管理维护；受 SystemConfig.homeCarouselOpen 总开关控制） */
  await prisma.homeBanner.deleteMany()
  for (const b of banners) {
    await prisma.homeBanner.create({
      data: {
        id: b.id,
        title: b.title,
        subtitle: b.subtitle ?? '',
        imageUrl: b.imageUrl ?? null,
        link: b.link ?? null,
        sort: b.sort ?? 0,
        enabled: b.enabled ?? true,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      },
    })
  }
  counts.HomeBanner = banners.length

  /* M2-R R3：政策与协议 */
  for (const p of policySeeds) {
    await prisma.policy.create({
      data: {
        id: p.id as string,
        kind: p.kind as string,
        category: (p.category as string) ?? '-',
        title: p.title as string,
        summary: (p.summary as string) ?? '',
        content: p.content as string,
        version: (p.version as string) ?? '1.0',
        effectiveAt: (p.effectiveAt as string) ?? null,
        publisher: (p.publisher as string) ?? '聚屿社区',
        attachments: p.attachments ?? [],
        featured: (p.featured as boolean) ?? false,
        status: (p.status as string) ?? 'published',
        publishedAt: p.publishedAt as string,
        updatedAt: p.updatedAt as string,
      },
    })
  }
  counts.Policy = policySeeds.length

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
        /* 演示用的历史记录可能不带 ip/快照（早期数据），缺失时保持 null */
        ip: l.ip ?? null,
        before: l.before ?? undefined,
        after: l.after ?? undefined,
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
    ['R', adminRoles.map((x: any) => x.id)],
    ['WS', workstations.map((x: any) => x.id)],
    ['WA', workstationAreas.map((x: any) => x.id)],
    ['LS', leases.map((x: any) => x.id)],
    ['S', spaces.map((x: any) => x.id)],
    ['SR', reservations.map((x: any) => x.id)],
    ['A', articles.filter((x: any) => x.channel !== 'submitted').map((x: any) => x.id)],
    ['SU', articles.filter((x: any) => x.channel === 'submitted').map((x: any) => x.id)],
    ['CL', columns.map((x: any) => x.id)],
    ['AN', announcements.map((x: any) => x.id)],
    ['BN', banners.map((x: any) => x.id)],
    ['N', notifications.map((x: any) => x.id)],
    ['AL', auditLogs.map((x: any) => x.id)],
    ['PL', policySeeds.map((x) => x.id as string)],
    ['MC', messageChannels.map((x: any) => x.id)],
    ['MT', messageTemplates.map((x: any) => x.id)],
    ['MV', messageTemplateVersions.map((x: any) => x.id)],
  ]
  for (const [prefix, ids] of idSeeds) {
    const nextNumber = ids.reduce((max, id) => Math.max(max, numericSuffix(id)), 0)
    await prisma.idSequence.upsert({
      where: { entityType: prefix },
      create: { entityType: prefix, nextNumber },
      update: { nextNumber },
    })
  }

  // 项目编号序列 CODE-<year>（JY-YYYY-NN 与项目 ID 序列 P 分离，按年独立发号）
  const codeYearMax = new Map<string, number>()
  for (const p of projects) {
    const m = /^JY-(\d{4})-(\d+)$/.exec(p.code)
    if (m) codeYearMax.set(m[1], Math.max(codeYearMax.get(m[1]) ?? 0, Number(m[2])))
  }
  for (const [year, max] of codeYearMax) {
    const key = `CODE-${year}`
    await prisma.idSequence.upsert({
      where: { entityType: key },
      create: { entityType: key, nextNumber: max },
      update: { nextNumber: max },
    })
  }
  counts.IdSequence = idSeeds.length

  // ---------- 应用缓存清理（wiki-backend.md §10） ----------
  await clearAppCache()

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
