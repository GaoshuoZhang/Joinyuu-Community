/* 生产初始化种子：补齐「基础配置」，不含任何演示业务数据。
 *
 *   pnpm db:init  → 字典 / 权限点（补齐缺项）/ 角色 / 超级管理员 / 系统配置 / 归档设置
 *                   / 等级与积分经验规则 / 发布限制（补齐等级维度）/ 名片字段
 *                   / 消息渠道与模板 / ID 发号序列
 *   pnpm db:seed  → 上述基础配置 + 演示业务数据（用户、需求、项目、活动、商城订单、审计日志…），
 *                   仅供本地开发与 e2e 使用，请勿在生产执行
 *
 * 与迁移的关系：部分基础配置已由 migrations 写入（权限点、名片字段、个人维度发布限制等，
 * 见 prisma/migrations/*_rule_redesign、*_banners_permission 等），因此本脚本所有写入都按
 * 「冲突即跳过」处理：已存在的数据（含迁移写入值）保持不动，只补齐缺失项。等级维度的发布限制
 * 由本脚本补齐（迁移执行时 LevelTier 尚为空，无法生成）。以上数值均可在后台按需调整。
 *
 * 安全约定：只允许在尚未初始化的数据库上执行（判据为「超级管理员 / 系统配置 / 字典项」三者皆空，
 * 这三张表迁移不会写入）；已初始化则立即中止，避免重复执行把线上库写脏。
 * 超管初始密码取 INIT_ADMIN_PASSWORD，未配置时随机生成并只打印一次。
 *
 * 用法：pnpm db:migrate && pnpm db:init */
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import Redis from 'ioredis'
import { APP_CACHE_KEYS } from '../src/common/redis/cache-keys'
import { formatNow } from '../src/common/utils/time'
import { levelPublishingLimitSeeds, personalPublishingLimitSeeds } from './seed-data/engagement'

const prisma = new PrismaClient()

const ADMIN_USERNAME = 'admin'
const ADMIN_NAME = '社区管理员'

/* 各前缀起始序号统一从 1000 起，使首个实体编号为 4 位（U1001 / MC1001 …），与库内既有编号习惯一致；
 * 项目编号 CODE-<年> 单独从 0 起，保证首个项目号为 JY-YYYY-01（服务端按 padStart(2) 格式化）。 */
const ID_START = 1000
const ID_PREFIXES = [
  'U', 'E', 'AP', 'D', 'P', 'EV', 'XE', 'EX', 'PT', 'G', 'RO', 'R',
  'WS', 'WA', 'LS', 'S', 'SR', 'SU', 'A', 'CL', 'AN', 'BN', 'N', 'AL', 'PL',
  'MC', 'MT', 'MV', 'OB', 'ML', 'SL', 'EI', 'TR', 'UN', 'DR', 'UM', 'AST', 'LL',
]

/* 归档设置域（与 seed.ts 保持一致：各标签页默认关闭自动归档/自动删除） */
const ARCHIVE_DOMAINS = [
  'enterprise', 'externalEnterprise', 'article', 'submission', 'announcement', 'demand', 'project',
  'event', 'lease', 'reservation', 'goods', 'order', 'application', 'userMessage',
]

/* 清空应用缓存键（与 seed.ts 同口径；Redis 不可用时静默跳过，不阻断初始化） */
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
    const keys = [
      ...APP_CACHE_KEYS,
      ...(await redis.keys('auth:admin:perms:*')),
      ...(await redis.keys('auth:admin:profile:*')),
      'auth:admin:sessions',
    ]
    if (keys.length > 0) await redis.del(...keys)
    console.log(`[init] 应用缓存已清理（${keys.length} 键）`)
  } catch (e) {
    console.warn('[init] 缓存清理跳过（Redis 不可用）:', e instanceof Error ? e.message : e)
  } finally {
    redis.disconnect()
  }
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { dicts } = require('./seed-data/dict')
const { systemConfig } = require('./seed-data/systemConfig')
const { permissionCatalog, adminRoles } = require('./seed-data/rbac')
const { messageChannels, messageTemplates, messageTemplateVersions } = require('./seed-data/messaging')
const { pointsRules } = require('./seed-data/mall')
const { experienceRules, levelTiers } = require('./seed-data/rules')
/* eslint-enable @typescript-eslint/no-var-requires */

async function assertNotInitialized(): Promise<void> {
  const [adminUsers, configs, dictEntries] = await Promise.all([
    prisma.adminUser.count(),
    prisma.systemConfig.count(),
    prisma.dictEntry.count(),
  ])
  if (adminUsers + configs + dictEntries > 0) {
    throw new Error(
      `检测到数据库已初始化（超级管理员 ${adminUsers} / 系统配置 ${configs} / 字典项 ${dictEntries}）：` +
        'db:init 仅用于未初始化的数据库，已中止。开发库可用 pnpm db:reset 重建；生产请改用全新数据库。',
    )
  }
}

async function main(): Promise<void> {
  await assertNotInitialized()
  const counts: Record<string, number> = {}

  /* ---------- 消息中心：渠道 / 模板（凭据仅登记环境变量名，值由部署侧注入） ---------- */
  await prisma.messageChannel.createMany({ data: messageChannels, skipDuplicates: true })
  await prisma.messageTemplate.createMany({ data: messageTemplates, skipDuplicates: true })
  await prisma.messageTemplateVersion.createMany({ data: messageTemplateVersions, skipDuplicates: true })
  counts.MessageChannel = messageChannels.length
  counts.MessageTemplate = messageTemplates.length
  counts.MessageTemplateVersion = messageTemplateVersions.length

  /* ---------- 认证与基础设施：权限点 → 角色 → 角色权限 → 超级管理员 ---------- */
  /* 权限点由迁移补充过历史项，这里补齐目录中的其余权限码（已存在的保持迁移值） */
  await prisma.adminPermission.createMany({ data: permissionCatalog, skipDuplicates: true })
  counts.AdminPermission = permissionCatalog.length

  await prisma.adminRole.createMany({
    data: adminRoles.map((r: { id: string; code: string; name: string; description: string; sort: number; dataScope?: string[] }) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      sort: r.sort,
      dataScope: r.dataScope ?? [],
      createdAt: formatNow(),
    })),
    skipDuplicates: true,
  })
  counts.AdminRole = adminRoles.length

  await prisma.adminRolePermission.createMany({
    data: adminRoles.flatMap((r: { id: string; permCodes: string[] }) =>
      r.permCodes.map((permissionCode) => ({ roleId: r.id, permissionCode })),
    ),
    skipDuplicates: true,
  })

  /* 只建超级管理员：运营/审核等账号按需在后台「账号管理」创建，避免沿用以 admin123 为初始密码的演示账号 */
  const superRole = adminRoles.find((r: { code: string }) => r.code === 'super')
  if (!superRole) throw new Error('种子数据缺少超级管理员角色（code=super）')
  const providedPassword = (process.env.INIT_ADMIN_PASSWORD ?? '').trim()
  const password = providedPassword || randomBytes(12).toString('base64url')
  const created = await prisma.adminUser.create({
    data: {
      username: ADMIN_USERNAME,
      passwordHash: await hash(password, 10),
      name: ADMIN_NAME,
      status: 'active',
      lastLoginAt: null,
      passwordUpdatedAt: formatNow(),
    },
  })
  await prisma.adminUserRole.create({ data: { adminUserId: created.id, roleId: superRole.id } })
  counts.AdminUser = 1

  /* ---------- 系统配置 + 归档设置 ---------- */
  await prisma.systemConfig.createMany({
    data: [{
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
      passwordExpireEnabled: systemConfig.passwordExpireEnabled,
      passwordExpireDays: systemConfig.passwordExpireDays,
      minioEnabled: systemConfig.minioEnabled,
      minioEndpoint: systemConfig.minioEndpoint,
      minioPort: systemConfig.minioPort,
      minioUseSsl: systemConfig.minioUseSsl,
      minioAccessKey: systemConfig.minioAccessKey,
      minioSecretKey: systemConfig.minioSecretKey,
      minioBucket: systemConfig.minioBucket,
      realnameRequired: systemConfig.realnameRequired,
      updatedAt: formatNow(),
      updatedBy: '系统初始化',
    }],
    skipDuplicates: true,
  })
  counts.SystemConfig = 1

  await prisma.archiveSetting.createMany({
    data: ARCHIVE_DOMAINS.map((domain) => ({ domain })),
    skipDuplicates: true,
  })
  counts.ArchiveSetting = ARCHIVE_DOMAINS.length

  /* ---------- 数据字典（站点选项词汇的单一来源） ---------- */
  for (const [type, entries] of Object.entries(dicts) as Array<[string, Array<{ code: string; label: string; sort: number; status?: string }>]>) {
    await prisma.dictEntry.createMany({
      data: entries.map((e) => ({ type, code: e.code, label: e.label, sort: e.sort, status: e.status ?? 'enabled' })),
      skipDuplicates: true,
    })
    counts.DictEntry = (counts.DictEntry ?? 0) + entries.length
  }

  /* ---------- 规则类基础配置：发布限制 / 名片字段 / 等级 / 积分 / 经验 ---------- */
  const levelsOf = (identityType: string): number[] =>
    levelTiers.filter((t: { identityType: string }) => t.identityType === identityType).map((t: { level: number }) => t.level)
  const publishingLimits = [
    ...personalPublishingLimitSeeds,
    ...levelPublishingLimitSeeds('community_individual', levelsOf('community_individual')),
    ...levelPublishingLimitSeeds('community_enterprise', levelsOf('community_enterprise')),
  ]
  await prisma.publishingLimitRule.createMany({ data: publishingLimits, skipDuplicates: true })
  counts.PublishingLimitRule = publishingLimits.length

  await prisma.cardFieldConfig.createMany({
    data: [
      { type: 'individual', editableFields: ['displayName', 'age', 'politicalStatus', 'intro', 'industryExperience', 'skills', 'education', 'work', 'projects', 'honors', 'socials', 'customLinks', 'visibility'], updatedAt: formatNow(), updatedBy: '系统初始化' },
      { type: 'enterprise', editableFields: ['logo', 'industry', 'size', 'foundedAt', 'website', 'address', 'description', 'services', 'advantages'], updatedAt: formatNow(), updatedBy: '系统初始化' },
    ],
    skipDuplicates: true,
  })
  counts.CardFieldConfig = 2

  await prisma.levelTier.createMany({
    data: levelTiers.map((t: { identityType: string; level: number; label: string; threshold: number }) => ({
      identityType: t.identityType, level: t.level, label: t.label, threshold: t.threshold,
    })),
    skipDuplicates: true,
  })
  counts.LevelTier = levelTiers.length

  await prisma.pointsRule.createMany({
    data: pointsRules.map((r: { code: string; name: string; scene: string; points: number; status?: string; description?: string | null; updatedAt: string }) => ({
      code: r.code, name: r.name, scene: r.scene, points: r.points,
      status: r.status ?? 'enabled', description: r.description ?? null, updatedAt: r.updatedAt,
    })),
    skipDuplicates: true,
  })
  counts.PointsRule = pointsRules.length

  await prisma.experienceRule.createMany({
    data: experienceRules.map((r: { code: string; name: string; scene: string; exp: number; status?: string; description?: string | null; updatedAt: string }) => ({
      code: r.code, name: r.name, scene: r.scene, exp: r.exp,
      status: r.status ?? 'enabled', description: r.description ?? null, updatedAt: r.updatedAt,
    })),
    skipDuplicates: true,
  })
  counts.ExperienceRule = experienceRules.length

  /* ---------- ID 发号序列：全新库从 1000 起，首个实体编号为 4 位 ---------- */
  const year = new Date().getFullYear()
  await prisma.idSequence.createMany({
    data: [
      ...ID_PREFIXES.map((entityType) => ({ entityType, nextNumber: ID_START })),
      { entityType: `CODE-${year}`, nextNumber: 0 },
    ],
    skipDuplicates: true,
  })
  counts.IdSequence = ID_PREFIXES.length + 1

  await clearAppCache()

  console.log('[init] 基础配置写入完成，实体计数：')
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name} = ${count}`)
  }
  console.log(`[init] 超级管理员：${ADMIN_USERNAME} / ${ADMIN_NAME}`)
  if (providedPassword) {
    console.log('[init] 初始密码取自 INIT_ADMIN_PASSWORD，请登录后立即修改')
  } else {
    console.log(`[init] 初始密码：${password}（仅本次打印，请立即登录并修改密码）`)
  }
}

main()
  .catch((e) => {
    console.error('[init] 初始化失败:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
