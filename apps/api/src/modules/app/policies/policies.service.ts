import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import {
  BUILTIN_AGREEMENT_PUBLISHED_AT,
  BUILTIN_AGREEMENT_VERSION,
  builtinAgreementByPath,
} from './builtin-agreements'

/** 协议路径 kind（与 AgreementConsent.agreementType 口径一致）→ Policy.kind 映射 */
const AGREEMENT_KINDS: Record<string, string> = {
  user_agreement: 'agreement_user',
  privacy_policy: 'agreement_privacy',
}

/** 协议版本下发（M2-R R3 /api/app/policies/:kind）：注册/设置页读取最新 published 协议；
 * 数据库未发布时回退内置 V1.0（正式部署兜底，保证注册可用）。 */
@Injectable()
export class AppPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 指定协议的最新 published 版本（publishedAt 倒序取一）；缺失时返回内置 V1.0 */
  async agreement(kind: string) {
    const policyKind = AGREEMENT_KINDS[kind]
    if (!policyKind) throw new NotFoundException('暂未发布该协议')
    const row = await this.prisma.policy.findFirst({
      where: { kind: policyKind, status: 'published' },
      orderBy: { publishedAt: 'desc' },
    })
    if (row) {
      return {
        kind,
        version: row.version,
        title: row.title,
        content: row.content,
        publishedAt: row.publishedAt,
        builtIn: false,
      }
    }
    const builtin = builtinAgreementByPath(kind)
    if (!builtin) throw new NotFoundException('暂未发布该协议')
    return {
      kind,
      version: BUILTIN_AGREEMENT_VERSION,
      title: builtin.title,
      content: builtin.content,
      publishedAt: BUILTIN_AGREEMENT_PUBLISHED_AT,
      builtIn: true,
    }
  }
}
