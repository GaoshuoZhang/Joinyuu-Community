import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import { Public } from '../../../common/decorators/public.decorator'
import { AppEnterprisesService } from './enterprises.service'
import { UpdateIndividualCardDto } from './dto/individual-card.dto'
import {
  ExitApplicationDto,
  InviteMemberDto,
  RemoveMemberDto,
  RespondActionDto,
  TransferContactDto,
  UpdateEnterpriseDto,
  UpdateMemberDto,
} from './dto/enterprise.dto'
import { SaveCardSchemaDto } from './dto/card-schema.dto'

/* 企业治理（M2-R R3 /api/app/**）：名片/身份、企业详情与成员管理、邀请、负责人转移、
 * 退驻、公开企业名片与工作台。全局 AppJwtGuard 注入登录态。 */
@Controller('api/app')
export class AppEnterprisesController {
  constructor(private readonly enterprises: AppEnterprisesService) {}

  /** 我的名片（个人名片 + 企业名片入口） */
  @Get('me/cards')
  myCards(@Req() req: AppAuthenticatedRequest) {
    return this.enterprises.myCards(this.uid(req))
  }

  /** 当前名片类型允许用户编辑的字段白名单。 */
  @Get('card-schema/:type')
  cardSchema(@Param('type') type: string) {
    return this.enterprises.cardSchema(type)
  }

  /** 保存个人名片（免审保存即公开） */
  @Put('me/cards/individual')
  updateIndividualCard(@Req() req: AppAuthenticatedRequest, @Body() dto: UpdateIndividualCardDto): Promise<{ code: number }> {
    return this.enterprises.updateIndividualCard(this.uid(req), dto)
  }

  /** 我的关联身份（社区个体 + 社区企业 + 合作企业） */
  @Get('me/identities')
  myIdentities(@Req() req: AppAuthenticatedRequest) {
    return this.enterprises.myIdentities(this.uid(req))
  }

  /** 企业详情（成员/负责人可查看） */
  @Get('me/enterprises/:id')
  enterpriseDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.enterprises.enterpriseDetail(this.uid(req), id)
  }

  /** 修改企业名片（需 edit_card 权限） */
  @Put('me/enterprises/:id')
  updateEnterprise(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEnterpriseDto,
  ): Promise<{ code: number }> {
    return this.enterprises.updateEnterprise(this.uid(req), id, dto)
  }

  /** 邀请企业成员（需 invite_member 权限，生成 EI 记录并通知被邀请人） */
  @HttpCode(200)
  @Post('me/enterprises/:id/invite')
  inviteMember(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ): Promise<{ code: number }> {
    return this.enterprises.inviteMember(this.uid(req), id, dto)
  }

  /** 修改成员职位/手机号（manage_members）与权限（assign_permission） */
  @Put('me/enterprises/:id/member')
  updateMember(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<{ code: number }> {
    return this.enterprises.updateMember(this.uid(req), id, dto)
  }

  /** 移除企业成员（manage_members；负责人需先完成转移） */
  @HttpCode(200)
  @Post('me/enterprises/:id/remove-member')
  removeMember(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RemoveMemberDto,
  ): Promise<{ code: number }> {
    return this.enterprises.removeMember(this.uid(req), id, dto)
  }

  /** 发起负责人转移（仅负责人，生成 TR 记录并通知目标成员） */
  @HttpCode(200)
  @Post('me/enterprises/:id/transfer-contact')
  transferContact(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TransferContactDto,
  ): Promise<{ code: number }> {
    return this.enterprises.transferContact(this.uid(req), id, dto)
  }

  /** 我收到的负责人转移请求 */
  @Get('me/transfer-requests')
  myTransferRequests(@Req() req: AppAuthenticatedRequest) {
    return this.enterprises.myTransferRequests(this.uid(req))
  }

  /** 接受/拒绝负责人转移（仅被转移人） */
  @HttpCode(200)
  @Post('me/transfer-requests/:requestId/respond')
  respondTransfer(
    @Req() req: AppAuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() dto: RespondActionDto,
  ): Promise<{ code: number }> {
    return this.enterprises.respondTransfer(this.uid(req), requestId, dto)
  }

  /** 发起方撤销待确认的转移请求 */
  @HttpCode(200)
  @Post('me/transfer-requests/:requestId/cancel')
  cancelTransfer(
    @Req() req: AppAuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<{ code: number }> {
    return this.enterprises.cancelTransfer(this.uid(req), requestId)
  }

  /** 邀请详情（被邀请人/邀请人可查看） */
  @Get('invitations/:id')
  invitationDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.enterprises.invitationDetail(this.uid(req), id)
  }

  /** 被邀请人接受/拒绝邀请 */
  @HttpCode(200)
  @Post('invitations/:id/respond')
  respondInvitation(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RespondActionDto,
  ): Promise<{ code: number }> {
    return this.enterprises.respondInvitation(this.uid(req), id, dto)
  }

  /** 撤销待接受的邀请（仅邀请人，需 invite_member 权限） */
  @HttpCode(200)
  @Post('me/enterprises/invitations/:invitationId/revoke')
  revokeInvitation(
    @Req() req: AppAuthenticatedRequest,
    @Param('invitationId') invitationId: string,
  ): Promise<{ code: number }> {
    return this.enterprises.revokeInvitation(this.uid(req), invitationId)
  }

  /** 退驻申请（仅负责人，写 Application type=exit） */
  @HttpCode(200)
  @Post('me/enterprises/:id/exit-application')
  submitExitApplication(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ExitApplicationDto,
  ): Promise<{ code: number }> {
    return this.enterprises.submitExitApplication(this.uid(req), id, dto)
  }

  /** 公开企业名片（仅 published 且未删除可见；移动端企业名片页为游客可访问路由） */
  @Public()
  @Get('enterprises/:id')
  enterpriseShowcase(@Param('id') id: string) {
    return this.enterprises.enterpriseShowcase(id)
  }

  /** 从请求中取当前用户 uid（AppJwtGuard 注入 request.user） */
  private uid(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}


/* 名片后台维护（原「名片管理」页已下线，编辑入口并入企业/个体详情页的名片标签页）：
 * 字段白名单随「系统配置」页维护，名片读写按所在域权限放行。 */
@Controller('api/admin/cards')
export class CardsAdminController {
  constructor(private readonly enterprises: AppEnterprisesService) {}

  @Get('schema/:type')
  @RequirePermission('/system/config')
  schema(@Param('type') type: string) { return this.enterprises.cardSchema(type) }

  @Put('schema/:type')
  @RequirePermission('/system/config')
  saveSchema(@Param('type') type: string, @Body() dto: SaveCardSchemaDto, @Req() req: AuthenticatedRequest) {
    return this.enterprises.saveCardSchema(type, dto.editableFields, req.user?.name ?? '社区管理员')
  }

  @Get('individual/:uid')
  @RequirePermission('/users')
  individualCard(@Param('uid') uid: string) { return this.enterprises.adminCard('individual', uid) }

  @Get('enterprise/:id')
  @RequirePermission('/enterprises')
  enterpriseCard(@Param('id') id: string) { return this.enterprises.adminCard('enterprise', id) }

  @Get(':type')
  @RequirePermission(['/users', '/enterprises'])
  cards(@Param('type') type: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('keyword') keyword?: string) {
    return this.enterprises.adminCards(type, Math.max(1, Number(page) || 1), Math.max(1, Math.min(100, Number(pageSize) || 20)), keyword)
  }

  @Put('individual/:uid')
  @RequirePermission('/users')
  updateIndividual(@Param('uid') uid: string, @Body() dto: UpdateIndividualCardDto, @Req() req: AuthenticatedRequest) {
    return this.enterprises.adminUpdateIndividualCard(uid, dto, req.user?.name ?? '社区管理员')
  }

  @Put('enterprise/:id')
  @RequirePermission('/enterprises')
  updateEnterprise(@Param('id') id: string, @Body() dto: UpdateEnterpriseDto, @Req() req: AuthenticatedRequest) {
    return this.enterprises.adminUpdateEnterpriseCard(id, dto, req.user?.name ?? '社区管理员')
  }
}
