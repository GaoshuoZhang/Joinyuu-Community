import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { SaveAgreementPolicyDto, SaveCommunityPolicyDto } from './dto/governance.dto'
import { GovernanceService } from './governance.service'

@Controller('api/admin/contents/policies')
@RequirePermission('/contents/policies')
export class CommunityPoliciesController {
  constructor(private readonly governance: GovernanceService) {}

  @Get()
  list() { return this.governance.policies('community') }

  @Post()
  @HttpCode(200)
  create(@Body() dto: SaveCommunityPolicyDto, @Req() req: AuthenticatedRequest) {
    return this.governance.createCommunityPolicy(dto, req.user?.name ?? '社区管理员')
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: SaveCommunityPolicyDto, @Req() req: AuthenticatedRequest) {
    return this.governance.updateCommunityPolicy(id, dto, req.user?.name ?? '社区管理员')
  }
}

@Controller('api/admin/system/policies')
@RequirePermission('/system/policies')
export class AgreementPoliciesController {
  constructor(private readonly governance: GovernanceService) {}

  @Get()
  list() { return this.governance.policies('agreement') }

  @Post()
  @HttpCode(200)
  create(@Body() dto: SaveAgreementPolicyDto, @Req() req: AuthenticatedRequest) {
    return this.governance.createAgreementPolicy(dto, req.user?.name ?? '社区管理员')
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: SaveAgreementPolicyDto, @Req() req: AuthenticatedRequest) {
    return this.governance.updateAgreementPolicy(id, dto, req.user?.name ?? '社区管理员')
  }
}
