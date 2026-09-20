import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { AuditService } from '../audit/audit.service'
import { CACHE_KEYS } from '../redis/cache-keys'
import { formatNow } from '../utils/time'
import { AliyunRealnameVerifier } from './aliyun-verifier'
import { TencentRealnameVerifier } from './tencent-verifier'
import {
  REALNAME_PROVIDER_META,
  REALNAME_TEST_SAMPLE_NAME,
  isRealnameProvider,
  realnameProviderMeta,
  sampleCitizenId,
  type RealnameProvider,
  type RealnameVerifier,
  type RealnameVerifyResult,
} from './realname-verifier'
import {
  realnameVerificationView,
  realnameMode,
  realnameProviderOptions,
  resolveRealnameRuntime,
  type RealnameVerificationView,
} from './realname-config'

const OUTCOME_LABEL: Record<string, string> = {
  match: '一致',
  mismatch: '不一致',
  no_record: '无此记录',
}

/* 实名核验服务（P1）：联通性测试 + 权威核验。
 * - 联通判定：接口可正常返回业务结果即算联通（固定样例，不要求核验一致），成本最低；
 * - 配置变更由 SystemConfigService 重置 testOk，必须重新测试；
 * - 未联通时 verifyAuthoritative 返回 null，调用方回退「身份信息登记」规则校验。 */
@Injectable()
export class RealnameVerificationService {
  private readonly verifiers = new Map<RealnameProvider, RealnameVerifier>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {
    this.verifiers.set('aliyun', new AliyunRealnameVerifier())
    this.verifiers.set('tencent', new TencentRealnameVerifier())
  }

  /** 供应商目录（管理端表单渲染与校验共用） */
  catalog(): { providers: typeof REALNAME_PROVIDER_META; options: Array<{ provider: RealnameProvider; label: string }> } {
    return { providers: REALNAME_PROVIDER_META, options: realnameProviderOptions() }
  }

  async view(): Promise<RealnameVerificationView> {
    return realnameVerificationView(await this.configRow())
  }

  /** 客户端展示模式：verified=「实名认证」（启用且已联通）/ registration=「身份信息登记」 */
  async mode(): Promise<'verified' | 'registration'> {
    return realnameMode(await this.configRow())
  }

  /** 权威核验：仅在「已启用 + 已联通 + 凭据齐备」时调用；否则返回 null（走规则登记） */
  async verifyAuthoritative(realName: string, citizenId: string): Promise<RealnameVerifyResult | null> {
    const row = await this.configRow()
    const view = realnameVerificationView(row)
    if (view.realnameMode !== 'verified') return null
    const runtime = resolveRealnameRuntime(row)
    if (!runtime) return null
    const verifier = this.verifiers.get(runtime.provider)
    if (!verifier) return null
    return verifier.verify({ realName, citizenId, config: runtime.config, credentials: runtime.credentials })
  }

  /** 测试联通：接口可调用即算联通（固定样例，不要求核验一致）；结果写回并清缓存 */
  async testConnectivity(operator: string): Promise<{ ok: boolean; message: string; provider: string }> {
    const row = await this.configRow()
    const view = realnameVerificationView(row)
    if (!view.realnameVerifyEnabled) throw new BadRequestException('请先启用实名核验')
    if (!isRealnameProvider(view.realnameVerifyProvider)) throw new BadRequestException('请先选择核验供应商')

    const runtime = resolveRealnameRuntime(row)
    if (!runtime || !runtime.credentialConfigured) {
      await this.writeTestResult(false)
      throw new BadRequestException(
        `凭据环境变量未齐备：${(runtime?.missingCredentials ?? view.realnameVerifyMissingCredentials).join('、') || '未登记'}`,
      )
    }

    const verifier = this.verifiers.get(runtime.provider)
    if (!verifier) throw new BadRequestException(`不支持的核验供应商：${runtime.provider}`)

    const meta = realnameProviderMeta(runtime.provider)
    const startedAt = Date.now()
    try {
      const result = await verifier.verify({
        realName: REALNAME_TEST_SAMPLE_NAME,
        citizenId: sampleCitizenId(),
        config: runtime.config,
        credentials: runtime.credentials,
      })
      const costMs = Date.now() - startedAt
      await this.writeTestResult(true)
      await this.audit.record({
        module: '系统管理',
        action: '测试实名核验联通',
        target: meta?.label ?? runtime.provider,
        detail: `结果：可调用（样例返回「${OUTCOME_LABEL[result.outcome] ?? result.outcome}」，${costMs}ms）`,
        operator,
      })
      return {
        ok: true,
        provider: runtime.provider,
        message: `接口可调用（样例返回「${OUTCOME_LABEL[result.outcome] ?? result.outcome}」，${costMs}ms）`,
      }
    } catch (error) {
      await this.writeTestResult(false)
      const message = error instanceof Error ? error.message : String(error)
      await this.audit.record({
        module: '系统管理',
        action: '测试实名核验联通失败',
        target: meta?.label ?? runtime.provider,
        detail: message.slice(0, 255),
        operator,
      })
      throw new BadRequestException(`联通测试失败：${message}`)
    }
  }

  private async configRow() {
    return this.prisma.systemConfig.findUnique({ where: { id: 1 } })
  }

  private async writeTestResult(ok: boolean): Promise<void> {
    await this.prisma.systemConfig.update({
      where: { id: 1 },
      data: { realnameVerifyTestOk: ok, realnameVerifyTestedAt: ok ? formatNow() : null },
    })
    await this.redis.delCache(CACHE_KEYS.systemConfig)
  }
}
