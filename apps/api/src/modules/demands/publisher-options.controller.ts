import { Controller, Get, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { AdminPermissionService } from '../../common/rbac/admin-permission.service'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { DemandsService, type PublisherOptionsDto } from './demands.service'

/* GET /api/admin/publisher-options —— 提交人选项（全部个人用户 + 全部企业，含联系电话自动填充）
 * 路径与需求域同级（/api/admin 而非 /api/admin/demands），故独立 Controller 挂同一模块；
 * 含联系电话，按使用它的页面权限放行（需求/企业/资讯发布 任一即可）。
 * 数据域收敛：联系方式属 members 域数据，操作者数据范围未含 members（且非超管/非全域）时不下发，
 * 避免「持资讯发布权限但数据范围受限」的角色批量拉取全站实名与手机号。 */
@Controller('api/admin')
export class PublisherOptionsController {
  constructor(
    private readonly demands: DemandsService,
    private readonly permissions: AdminPermissionService,
  ) {}

  @RequirePermission(['/demands', '/enterprises', '/contents/publish'])
  @Get('publisher-options')
  async publisherOptions(@Req() req: AuthenticatedRequest): Promise<PublisherOptionsDto> {
    const options = await this.demands.publisherOptions()
    const profile = await this.permissions.getAccessProfile(req.user?.sub ?? '')
    const canSeeContacts = profile.super || profile.scopes.length === 0 || profile.scopes.includes('members')
    if (canSeeContacts) return options
    /* 脱敏：保留姓名/编号用于选择，联系方式置空由操作者自行填写 */
    return {
      users: options.users.map((u) => ({ ...u, phone: '', email: '' })),
      enterprises: options.enterprises.map((e) => ({ ...e, contactPhone: '', contactEmail: undefined })),
    }
  }
}