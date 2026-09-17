import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'

export const ENTERPRISE_PERMISSIONS = [
  'publish_demand',
  'respond_demand',
  'space_reserve',
  'article_submit',
  'manage_members',
  'invite_member',
  'assign_permission',
  'edit_card',
] as const

export type EnterprisePermission = (typeof ENTERPRISE_PERMISSIONS)[number]

/** Shared server-side authorization for every asEnterpriseId write path. */
export async function assertEnterprisePermission(
  prisma: PrismaService,
  uid: string,
  enterpriseId: string,
  permission: EnterprisePermission,
): Promise<void> {
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { contactUserId: true, deletedAt: true, status: true },
  })
  if (!enterprise || enterprise.deletedAt) throw new NotFoundException('企业不存在')
  if (enterprise.status !== 'active') throw new ForbiddenException('企业当前状态不可操作')
  if (enterprise.contactUserId === uid) return
  const identity = await prisma.userIdentity.findFirst({
    where: { userId: uid, type: 'community_enterprise', enterpriseId },
    select: { permissions: true },
  })
  if (!identity || !identity.permissions.includes(permission)) {
    throw new ForbiddenException('你没有该企业主体操作权限')
  }
}
