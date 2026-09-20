import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { NotificationService } from '../../../common/notify/notification.service'
import type { UpdateRealnameDto } from './dto/update-realname.dto'
import { currentPublishingLimits } from '../../../common/enterprise/publishing-limits'
import { formatNow } from '../../../common/utils/time'

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
  ) {}

  /** 实名状态：verified + 脱敏姓名（首字+*）+ 脱敏证件号（前4+**********+后4） */
  async status(uid: string) {
    const user = await this.prisma.user.findUnique({
      where: { uid },
      select: { realName: true, citizenId: true, verifiedAt: true },
    })
    if (!user) throw new NotFoundException('用户不存在')
    if (!user.realName || !user.citizenId) return { verified: false }
    return {
      verified: true,
      realName: maskName(user.realName),
      citizenIdMasked: maskCitizenId(user.citizenId),
      verifiedAt: user.verifiedAt ?? undefined,
    }
  }

  /** 提交实名认证：重复认证 409 → 姓名 2-20 字 → 身份证校验码校验 → 回写 + 站内信 */
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
      title: '实名认证已完成',
      content: `您的实名信息已通过规则校验（${maskName(realName)}）。`,
    })
    return { code: 0 }
  }

  /** 实名分级权益（两条静态分级，active 标注当前所处层级） */
  async rights(uid: string) {
    const { rules, subject } = await currentPublishingLimits(this.prisma, uid)
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 }, select: { realnameRequired: true } })
    const label = (n: number) => n < 0 ? '不限' : `${n} 次/日`
    const grouped = new Map<string, typeof rules>()
    for (const rule of rules) {
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
        title: first.identityType === 'personal_unverified' ? '未实名个人'
          : first.identityType === 'personal_verified' ? '已实名个人'
            : `${first.identityType === 'community_individual' ? '社区个体' : '社区企业'} · 等级 ${first.level}`,
        active,
        items: first.identityType === 'personal_unverified' && config?.realnameRequired
          ? ['当前社区要求先完成实名认证后再操作']
          : [`需求发布：${label(limit('demand_publish'))}`, `文章投稿：${label(limit('article_publish'))}`, `活动报名：${label(limit('event_enroll'))}`, `空间预约：${label(limit('space_reserve'))}`],
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
