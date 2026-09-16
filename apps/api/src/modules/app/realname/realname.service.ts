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
      select: { realName: true, citizenId: true },
    })
    if (!user) throw new NotFoundException('用户不存在')
    if (!user.realName || !user.citizenId) return { verified: false }
    return {
      verified: true,
      realName: maskName(user.realName),
      citizenIdMasked: maskCitizenId(user.citizenId),
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
      data: { realName, citizenId },
    })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '实名认证已完成',
      content: `您的实名认证已完成（${maskName(realName)}），已享受已实名分级权益。`,
    })
    return { code: 0 }
  }

  /** 实名分级权益（两条静态分级，active 标注当前所处层级） */
  async rights(uid: string) {
    const user = await this.prisma.user.findUnique({
      where: { uid },
      select: { realName: true, citizenId: true },
    })
    const verified = isVerified(user?.realName, user?.citizenId)
    return [
      {
        tier: 'unverified',
        title: '未实名',
        items: [
          '浏览社区内容、点赞与评论',
          '发布需求、报名活动按基础额度执行',
          '完成实名认证后可提升发布与报名额度',
        ],
        active: !verified,
      },
      {
        tier: 'verified',
        title: '已实名',
        items: [
          '发布需求与活动报名额度提升',
          '投稿、空间预约等完整社区服务',
          '企业合作与实名信任标识',
        ],
        active: verified,
      },
    ]
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
