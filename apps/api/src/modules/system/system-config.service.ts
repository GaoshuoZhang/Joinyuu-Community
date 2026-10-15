import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type SystemConfig } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { RedisService } from '../../common/redis/redis.service'
import { StorageService } from '../../common/storage/storage.service'
import { CACHE_KEYS, CACHE_TTL, PASSWORD_EXPIRED_KEY_PREFIX } from '../../common/redis/cache-keys'
import { minioConfigView } from '../../common/storage/minio-config'
import { realnameVerificationView, realnameCredentialMode } from '../../common/realname/realname-config'
import { RealnameVerificationService } from '../../common/realname/realname-verification.service'
import { REALNAME_PROVIDERS, REALNAME_PROVIDER_META, realnameProviderMeta } from '../../common/realname/realname-verifier'
import {
  mergeCredentialInput,
  normalizeCredentialMode,
  validateCredentialInput,
} from '../../common/credentials/credential-store'
import { normalizeMobileUrl } from '../../common/utils/mobile-url'
import { formatNow } from '../../common/utils/time'
import type { SystemConfigPayloadDto } from './dto/system-config-payload.dto'

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,62}$/

/** 审计快照入参（P0 密钥安全：不含 minioSecretKey 原文）。
 * 用 type 而非 interface，以便直接作为 Prisma InputJsonValue 写入审计。 */
type SystemConfigAuditSource = {
  siteName: string
  siteSlogan: string
  mobileUrl: string
  registrationOpen: boolean
  mallOpen: boolean
  demandOpen: boolean
  reservationOpen: boolean
  realnameRequired: boolean
  homeCarouselOpen: boolean
  leaseExpireRemindDays: number
  uploadMaxSizeMb: number
  passwordExpireEnabled: boolean
  passwordExpireDays: number
  minioEnabled: boolean
  minioEndpoint: string
  minioPort: number
  minioUseSsl: boolean
  minioAccessKey: string
  minioBucket: string
  realnameVerifyEnabled: boolean
  realnameVerifyProvider: string
  /** 凭据来源（inline/env）：审计中 inline 模式不回写凭据内容 */
  realnameVerifyCredentialMode: string
  /** P1 实名核验凭据（inline 模式恒为空，避免密钥进入审计；env 模式为变量名） */
  realnameVerifyCredentialEnv: unknown
}

type SystemConfigAuditSnapshot = Omit<SystemConfigAuditSource, 'realnameVerifyCredentialEnv'> & {
  realnameVerifyCredentialEnv: Record<string, string>
}

/* 系统配置（wiki-backend.md §7.15/§10）：单例读写，保存即生效并留痕（含 before/after 快照）；
 * GET 走 config:system 缓存（10min），PUT 主动失效。leaseExpireRemindDays 供租约临期通知任务与工作台待办读取。
 * MinIO（R4）：保存后调用 StorageService.invalidateConfig()，让存储驱动立即按新配置切换。
 * 密钥安全（P0）：GET 不回传 minioSecretKey 原文（只给"是否已配置"+脱敏值），审计快照剔除密钥原文；
 * SecretKey 写入语义为"留空=保持不变，非空=更新/轮换"，凭据可由 MINIO_SECRET_KEY / MINIO_ACCESS_KEY 环境变量优先注入。 */
@Injectable()
export class SystemConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly realname: RealnameVerificationService,
  ) {}

  async get(): Promise<Record<string, unknown>> {
    const config = await this.redis.remember(CACHE_KEYS.systemConfig, CACHE_TTL.stable, async () => {
      const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
      if (!config) throw new NotFoundException('系统配置不存在')
      return toSystemConfigDto(config)
    })
    return { ...config, mobileUrl: config.mobileUrl ?? 'localhost:7759' }
  }

  async save(payload: SystemConfigPayloadDto, operator: string): Promise<{ code: number }> {
    const siteName = (payload.siteName ?? '').trim()
    if (!siteName) throw new BadRequestException('站点名称不能为空')

    const days = payload.leaseExpireRemindDays
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('租约临期提醒窗口须为 1-90 的整数')
    }

    const uploadMaxSizeMb = payload.uploadMaxSizeMb
    if (!Number.isInteger(uploadMaxSizeMb) || uploadMaxSizeMb < 1 || uploadMaxSizeMb > 100) {
      throw new BadRequestException('上传文件大小限制须为 1-100 的整数')
    }

    /* 密码过期强制改密（仅后台管理员账号，与客户端无关）：缺省关闭 = 密码永不过期；
     * 开启后按 passwordExpireDays（1-3650）计算有效期，超期登录仅允许修改密码（见 auth.service）。 */
    const passwordExpireEnabled = payload.passwordExpireEnabled === true
    const passwordExpireDays = payload.passwordExpireDays
    if (!Number.isInteger(passwordExpireDays) || passwordExpireDays < 1 || passwordExpireDays > 3650) {
      throw new BadRequestException('密码过期周期须为 1-3650 的整数')
    }

    const minioPort = payload.minioPort
    if (!Number.isInteger(minioPort) || minioPort < 1 || minioPort > 65535) {
      throw new BadRequestException('MinIO 端口须为 1-65535 的整数')
    }

    const minioBucket = (payload.minioBucket ?? '').trim()
    if (!BUCKET_PATTERN.test(minioBucket)) {
      throw new BadRequestException('Bucket 名称格式不正确')
    }

    /* P1 实名核验：启用时必须单选供应商；凭据只登记环境变量名（值由部署侧注入） */
    const realnameVerifyEnabled = payload.realnameVerifyEnabled === true
    const realnameVerifyProvider = (payload.realnameVerifyProvider ?? '').trim()
    if (realnameVerifyEnabled && !(REALNAME_PROVIDERS as readonly string[]).includes(realnameVerifyProvider)) {
      throw new BadRequestException('启用实名核验时必须选择一个供应商')
    }
    const realnameVerifyConfig = asObject(payload.realnameVerifyConfig)
    /* 凭据来源：inline=后台直接填写（只写，留空保持原值）；env=登记环境变量名 */
    const realnameVerifyCredentialMode = normalizeCredentialMode(payload.realnameVerifyCredentialMode, 'inline')
    const realnameCredentialFields = realnameProviderMeta(realnameVerifyProvider)?.credentialKeys ?? []
    let realnameCredentialInput: Record<string, string>
    try {
      realnameCredentialInput = validateCredentialInput(
        realnameVerifyCredentialMode,
        payload.realnameVerifyCredentialEnv,
        realnameCredentialFields,
        '供应商',
      )
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '凭据校验失败')
    }

    const previous = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    const previousCredentials = asStringRecord(previous?.realnameVerifyCredentialEnv)
    const realnameVerifyCredentialEnv = mergeCredentialInput(
      realnameVerifyCredentialMode,
      realnameCredentialInput,
      previousCredentials,
    )

    /* 核验配置变更（启用/供应商/凭据来源/参数/凭据内容）即重置联通状态，必须重新测试联通 */
    const realnameChanged =
      !previous ||
      previous.realnameVerifyEnabled !== realnameVerifyEnabled ||
      previous.realnameVerifyProvider !== realnameVerifyProvider ||
      realnameCredentialMode(previous) !== realnameVerifyCredentialMode ||
      stableJson(previousCredentials) !== stableJson(realnameVerifyCredentialEnv) ||
      stableJson(asObject(previous.realnameVerifyConfig)) !== stableJson(realnameVerifyConfig)

    /* 密钥写入语义（P0 密钥安全）：留空 = 保持原值（支持仅改其他配置/单独轮换）；
     * 非空 = 更新或轮换。密钥原文不回传、不进审计快照，只记录"是否变更"。 */
    const providedSecretKey = (payload.minioSecretKey ?? '').trim()
    const nextSecretKey = providedSecretKey || previous?.minioSecretKey || ''
    const secretKeyChanged =
      providedSecretKey !== '' && providedSecretKey !== (previous?.minioSecretKey ?? '')

    const next = {
      siteName,
      mobileUrl: payload.mobileUrl === undefined ? previous?.mobileUrl ?? 'localhost:7759' : normalizeMobileUrl(payload.mobileUrl),
      siteSlogan: (payload.siteSlogan ?? '').trim(),
      registrationOpen: payload.registrationOpen,
      mallOpen: payload.mallOpen,
      demandOpen: payload.demandOpen,
      reservationOpen: payload.reservationOpen,
      realnameRequired: payload.realnameRequired,
      homeCarouselOpen: payload.homeCarouselOpen,
      leaseExpireRemindDays: days,
      uploadMaxSizeMb,
      passwordExpireEnabled,
      passwordExpireDays,
      minioEnabled: payload.minioEnabled,
      minioEndpoint: (payload.minioEndpoint ?? '').trim(),
      minioPort,
      minioUseSsl: payload.minioUseSsl,
      minioAccessKey: (payload.minioAccessKey ?? '').trim(),
      minioSecretKey: nextSecretKey,
      minioBucket,
      realnameVerifyEnabled,
      realnameVerifyProvider,
      realnameVerifyConfig: realnameVerifyConfig as Prisma.InputJsonValue,
      realnameVerifyCredentialMode,
      realnameVerifyCredentialEnv: realnameVerifyCredentialEnv as Prisma.InputJsonValue,
      realnameVerifyTestOk: realnameChanged ? false : previous?.realnameVerifyTestOk ?? false,
      realnameVerifyTestedAt: realnameChanged ? null : previous?.realnameVerifyTestedAt ?? null,
    }

    await this.prisma.systemConfig.update({
      where: { id: 1 },
      data: { ...next, updatedAt: formatNow(), updatedBy: operator },
    })

    /* 存储驱动立即按新配置切换（无需等待 StorageService 的 60s 判定缓存过期） */
    this.storage.invalidateConfig()

    /* 关闭开关即不再有过期概念：清理残留的密码过期标记（登录时写入、TTL 2h），
     * 否则已标记的账号在本会话内仍会被守卫拦截（403「密码已过期」）直到重新登录 */
    if (!passwordExpireEnabled) await this.redis.delByPrefix(PASSWORD_EXPIRED_KEY_PREFIX)

    await this.audit.record({
      module: '系统管理',
      action: '保存系统配置',
      target: '系统配置',
      detail: `临期提醒 ${days} 天 · 上传上限 ${uploadMaxSizeMb} MB · MinIO ${payload.minioEnabled ? '已启用' : '已停用'} · 密码过期强制改密 ${passwordExpireEnabled ? `已启用（${passwordExpireDays} 天）` : '已停用'}`,
      before: previous ? toConfigAuditSnapshot(previous) : undefined,
      after: { ...toConfigAuditSnapshot(next), minioSecretKeyChanged: secretKeyChanged, realnameVerifyChanged: realnameChanged },
      operator,
    })

    await this.redis.delCache(CACHE_KEYS.systemConfig)
    return { code: 0 }
  }

  /** 实名核验供应商目录（管理端表单渲染与校验共用） */
  realnameCatalog(): {
    options: Array<{ provider: string; label: string }>
    meta: typeof REALNAME_PROVIDER_META
  } {
    return {
      options: REALNAME_PROVIDERS.map((provider) => ({
        provider,
        label: realnameProviderMeta(provider)?.label ?? provider,
      })),
      meta: REALNAME_PROVIDER_META,
    }
  }

  /** 测试实名核验联通：接口可调用即算联通；成功后才允许客户端显示「实名认证」 */
  testRealnameVerification(operator: string): Promise<{ ok: boolean; message: string; provider: string }> {
    return this.realname.testConnectivity(operator)
  }
}

/** 管理端 GET 出参：MinIO 段走 minioConfigView（不含 SecretKey 原文，只给是否已配置 + 脱敏值） */
function toSystemConfigDto(config: SystemConfig): Record<string, unknown> {
  return {
    siteName: config.siteName,
    siteSlogan: config.siteSlogan,
    mobileUrl: config.mobileUrl,
    registrationOpen: config.registrationOpen,
    mallOpen: config.mallOpen,
    demandOpen: config.demandOpen,
    reservationOpen: config.reservationOpen,
    realnameRequired: config.realnameRequired,
    homeCarouselOpen: config.homeCarouselOpen,
    leaseExpireRemindDays: config.leaseExpireRemindDays,
    uploadMaxSizeMb: config.uploadMaxSizeMb,
    passwordExpireEnabled: config.passwordExpireEnabled,
    passwordExpireDays: config.passwordExpireDays,
    ...minioConfigView(config),
    ...realnameVerificationView(config),
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  }
}

/** 审计快照：剔除 minioSecretKey 原文（P0 密钥安全：审计不记录密钥内容） */
function toConfigAuditSnapshot(config: SystemConfigAuditSource): SystemConfigAuditSnapshot {
  return {
    siteName: config.siteName,
    siteSlogan: config.siteSlogan,
    mobileUrl: config.mobileUrl,
    registrationOpen: config.registrationOpen,
    mallOpen: config.mallOpen,
    demandOpen: config.demandOpen,
    reservationOpen: config.reservationOpen,
    realnameRequired: config.realnameRequired,
    homeCarouselOpen: config.homeCarouselOpen,
    leaseExpireRemindDays: config.leaseExpireRemindDays,
    uploadMaxSizeMb: config.uploadMaxSizeMb,
    passwordExpireEnabled: config.passwordExpireEnabled,
    passwordExpireDays: config.passwordExpireDays,
    minioEnabled: config.minioEnabled,
    minioEndpoint: config.minioEndpoint,
    minioPort: config.minioPort,
    minioUseSsl: config.minioUseSsl,
    minioAccessKey: config.minioAccessKey,
    minioBucket: config.minioBucket,
    realnameVerifyEnabled: config.realnameVerifyEnabled,
    realnameVerifyProvider: config.realnameVerifyProvider,
    realnameVerifyCredentialMode: config.realnameVerifyCredentialMode,
    /* 安全：inline 模式凭据是密钥原文，绝不写入审计；env 模式仅记变量名 */
    realnameVerifyCredentialEnv:
      config.realnameVerifyCredentialMode === 'env' ? asStringRecord(config.realnameVerifyCredentialEnv) : {},
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function asStringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(asObject(value))) {
    if (item != null && String(item).trim()) out[key] = String(item).trim()
  }
  return out
}

/** 键序无关的稳定序列化（用于判断核验配置是否变更） */
function stableJson(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return JSON.stringify(
      Object.keys(obj)
        .sort()
        .map((key) => [key, obj[key]]),
    )
  }
  return JSON.stringify(value)
}

/** 核验凭据入参校验已统一收敛到 common/credentials/credential-store（validateCredentialInput）。 */
