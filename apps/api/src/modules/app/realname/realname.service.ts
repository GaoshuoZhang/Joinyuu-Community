import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { RealnameVerificationService } from '../../../common/realname/realname-verification.service'
import { RealnameVerifyError } from '../../../common/realname/realname-verifier'
import type { UpdateRealnameDto } from './dto/update-realname.dto'
import { currentPublishingLimits } from '../../../common/enterprise/publishing-limits'
import { formatNow } from '../../../common/utils/time'
import { discountText } from '../../../common/points/points-discount'

/** GB 11643 身份证校验码：17 位数字加权因子与校验位映射（校验位 X 为大写） */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

/** 18 位身份证号校验（GB 11643 加权因子算法；末位校验码 X 大写） */
function isValidCitizenId(id: string): boolean {
  if (!/^\d{17}[\dX]$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 17; i += 1) sum += Number(id[i]) * ID_WEIGHTS[i]
  return ID_CHECK_CODES[sum % 11] === id[17]
}

/** 实名强制校验（M2-R R3 分级权益）：SystemConfig.realnameRequired 关闭时直接放行；
 * 开启且当前用户未实名（缺姓名或证件号）时禁止发布/报名类操作。导出供发布/报名模块复用。 */
export async function assertRealnameAllowed(
  prisma: PrismaService,
  uid: string,
  action: 'publish' | 'enroll',
): Promise<void> {
  const config = await prisma.systemConfig.findUnique({ where: { id: 1 } })
  if (!config?.realnameRequired) return
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { realName: true, citizenId: true },
  })
  if (user?.realName && user.citizenId) return
  throw new ForbiddenException(`完成实名认证后才能${action === 'publish' ? '发布' : '报名'}（实名分级权益）`)
}

/** 实名认证（/api/app/me/realname*）：脱敏状态查询、提交认证（校验码校验 + 站内信）、分级权益 */
@Injectable()
export class AppRealnameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationService,
    private readonly realname: RealnameVerificationService,
  ) {}

  /** 实名状态：verified + 脱敏姓名（首字+*）+ 脱敏证件号（前4+**********+后4）；
   * mode 表示客户端应显示「实名认证」（已联通权威核验）还是「身份信息登记」 */
  async status(uid: string) {
    const mode = await this.realname.mode()
    const user = await this.prisma.user.findUnique({
      where: { uid },
      select: { realName: true, citizenId: true, verifiedAt: true },
    })
    if (!user) throw new NotFoundException('用户不存在')
    if (!user.realName || !user.citizenId) return { verified: false, mode }
    return {
      verified: true,
      mode,
      realName: maskName(user.realName),
      citizenIdMasked: maskCitizenId(user.citizenId),
      verifiedAt: user.verifiedAt ?? undefined,
    }
  }

  /** 提交实名：重复认证 409 → 姓名 2-20 字 → 身份证格式/校验码 →
   * 已联通权威核验时按二要素校验（一致才通过）；未联通时按既有规则登记 → 回写 + 站内信 */
  async verify(uid: string, dto: UpdateRealnameDto): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({
      where: { uid },
      select: { realName: true, citizenId: true },
    })
    if (!user) throw new NotFoundException('用户不存在')
    if (isVerified(user.realName, user.citizenId)) throw new ConflictException('已完成实名认证')

    const realName = dto.realName.trim()
    if (realName.length < 2 || realName.length > 20) {
      throw new BadRequestException('真实姓名长度应为 2-20 个字')
    }
    const citizenId = dto.citizenId.trim()
    if (!isValidCitizenId(citizenId)) throw new BadRequestException('请输入有效的身份证号码')

    const authoritative = await this.verifyAuthoritative(realName, citizenId)
    if (authoritative && authoritative.outcome !== 'match') {
      throw new BadRequestException(
        authoritative.outcome === 'no_record'
          ? '未查询到该身份信息，请核对姓名与身份证号'
          : '姓名与身份证号不一致，请核对后重试',
      )
    }

    await this.prisma.user.update({
      where: { uid },
      data: {
        realName,
        citizenId,
        verifiedAt: formatNow(),
      },
    })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: authoritative ? '实名认证已完成' : '身份信息登记已完成',
      content: authoritative
        ? `您的实名信息已通过权威核验（${maskName(realName)}）。`
        : `您的身份信息已登记（${maskName(realName)}）。`,
    })
    return { code: 0 }
  }

  /** 权威核验包装：供应商异常（RealnameVerifyError，非 HttpException）统一兜底，
   * 避免全局过滤器转为 500；不透出供应商原始报文。 */
  private async verifyAuthoritative(realName: string, citizenId: string) {
    try {
      return await this.realname.verifyAuthoritative(realName, citizenId)
    } catch (error) {
      if (error instanceof RealnameVerifyError) {
        throw error.retriable
          ? new ServiceUnavailableException('实名核验服务暂时不可用，请稍后重试')
          : new BadRequestException('实名信息核验未通过')
      }
      throw error
    }
  }

  /** 实名分级权益（按 identityType:level 分组，active 标注当前所处层级）。
   * identityType：可选过滤（如只看社区个体 / 社区企业分组，等级轮播页用）；
   * enterpriseId：社区企业维度的 active 判定按该企业等级（企业详情页等级卡用）。 */
  async rights(uid: string, identityType?: string, enterpriseId?: string) {
    const { rules, subject } = await currentPublishingLimits(this.prisma, uid, {
      identityType: identityType || enterpriseId ? identityType : undefined,
      enterpriseId: enterpriseId || undefined,
    })
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 }, select: { realnameRequired: true } })
    /* 等级头衔（LevelTier.label）：社区个体/企业分组卡片展示「Lv.n 头衔」用 */
    const tiers = await this.prisma.levelTier.findMany()
    const tierLabel = new Map(tiers.map((t) => [`${t.identityType}:${t.level}`, t.label]))
    const thresholdOf = new Map(tiers.map((t) => [`${t.identityType}:${t.level}`, t.threshold]))
    /* 积分消费折扣（等级规则页配置）：等级权益卡展示用（未配置按原价） */
    const discountOf = new Map(tiers.map((t) => [`${t.identityType}:${t.level}`, t.pointsDiscount]))
    const label = (n: number) => n < 0 ? '不限' : `${n} 次/日`
    const grouped = new Map<string, typeof rules>()
    for (const rule of rules) {
      if (identityType && rule.identityType !== identityType) continue
      const key = `${rule.identityType}:${rule.level}`
      grouped.set(key, [...(grouped.get(key) ?? []), rule])
    }
    return [...grouped.values()].map(group => {
      const first = group[0]
      const limit = (action: string) => group.find(item => item.action === action)?.dailyLimit ?? -1
      const active = first.identityType === subject.identityType && first.level === subject.level
      return {
        identityType: first.identityType,
        level: first.level,
        /** 等级头衔（LevelTier 无该级配置时为空串） */
        label: tierLabel.get(`${first.identityType}:${first.level}`) ?? '',
        /** 达到该等级所需经验门槛（无配置为 null） */
        threshold: thresholdOf.get(`${first.identityType}:${first.level}`) ?? null,
        title: first.identityType === 'personal_unverified' ? '未实名个人'
          : first.identityType === 'personal_verified' ? '已实名个人'
            : `${first.identityType === 'community_individual' ? '社区个体' : '社区企业'} · 等级 ${first.level}`,
        active,
        items: first.identityType === 'personal_unverified' && config?.realnameRequired
          ? ['当前社区要求先完成实名认证后再操作']
          : first.identityType.startsWith('community_')
            /* 等级权益卡：活动报名 / 空间预约不再按等级区分（按身份组的额度在「个人用户规则」页维护），故不展示；
             * 折扣：1 = 1 折 … 10 = 原价（支持一位小数） */
            ? [
              `需求发布：${label(limit('demand_publish'))}`,
              `文章投稿：${label(limit('article_publish'))}`,
              `积分消费折扣：${discountText(discountOf.get(`${first.identityType}:${first.level}`))}`,
            ]
            : [
              `需求发布：${label(limit('demand_publish'))}`,
              `文章投稿：${label(limit('article_publish'))}`,
              `活动报名：${label(limit('event_enroll'))}`,
              `空间预约：${label(limit('space_reserve'))}`,
            ],
        limits: Object.fromEntries(group.map(item => [item.action, item.dailyLimit])),
      }
    })
  }
}

function isVerified(realName?: string | null, citizenId?: string | null): boolean {
  return !!realName && !!citizenId
}

/** 姓名脱敏：保留首字 + *（如 苏*） */
function maskName(name: string): string {
  return `${name.slice(0, 1)}*`
}

/** 证件号脱敏：前 4 位 + ********** + 后 4 位 */
function maskCitizenId(id: string): string {
  return `${id.slice(0, 4)}**********${id.slice(-4)}`
}
