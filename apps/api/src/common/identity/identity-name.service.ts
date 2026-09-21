import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  generateNicknameCandidate,
  generateUsernameCandidate,
  nicknameFormatError,
  normalizeUsername,
  usernameFormatError,
} from './identity-names'

/** 自动分配重试次数（撞名即换随机候选） */
const ASSIGN_RETRY = 8

/* 身份名唯一性与自动分配（username / nickname 全站唯一）。
 * 注册、后台建号、用户改资料、后台改资料共用，保证四个入口口径一致。 */
@Injectable()
export class IdentityNameService {
  constructor(private readonly prisma: PrismaService) {}

  async isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
    const value = normalizeUsername(username)
    if (!value) return false
    const row = await this.prisma.user.findUnique({ where: { username: value }, select: { uid: true } })
    return Boolean(row && row.uid !== excludeUid)
  }

  async isNicknameTaken(nickname: string, excludeUid?: string): Promise<boolean> {
    const value = (nickname ?? '').trim()
    if (!value) return false
    const row = await this.prisma.user.findUnique({ where: { nickname: value }, select: { uid: true } })
    return Boolean(row && row.uid !== excludeUid)
  }

  /** 校验用户名（格式 + 保留词 + 唯一），非法直接抛 400/409 */
  async assertUsernameAvailable(username: string, excludeUid?: string): Promise<string> {
    const normalized = normalizeUsername(username)
    const formatError = usernameFormatError(username)
    if (formatError) throw new BadRequestException(formatError)
    if (await this.isUsernameTaken(normalized, excludeUid)) throw new ConflictException('该用户名已被占用')
    return normalized
  }

  /** 校验昵称（格式 + 保留词 + 唯一），非法直接抛 400/409 */
  async assertNicknameAvailable(nickname: string, excludeUid?: string): Promise<string> {
    const value = (nickname ?? '').trim()
    const formatError = nicknameFormatError(value)
    if (formatError) throw new BadRequestException(formatError)
    if (await this.isNicknameTaken(value, excludeUid)) throw new ConflictException('该昵称已被占用')
    return value
  }

  /** 自动分配唯一用户名（注册/后台建号用） */
  async assignUsername(): Promise<string> {
    for (let i = 0; i < ASSIGN_RETRY; i += 1) {
      const candidate = generateUsernameCandidate()
      if (!(await this.isUsernameTaken(candidate))) return candidate
    }
    /* 极端撞名兜底：追加时间戳保证唯一 */
    return `user_${Date.now().toString(36)}`
  }

  /** 自动分配唯一昵称（注册/后台建号用） */
  async assignNickname(): Promise<string> {
    for (let i = 0; i < ASSIGN_RETRY; i += 1) {
      const candidate = generateNicknameCandidate()
      if (!(await this.isNicknameTaken(candidate))) return candidate
    }
    return `岛民${Date.now().toString().slice(-6)}`
  }
}
