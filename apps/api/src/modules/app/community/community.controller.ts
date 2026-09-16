import { Controller, Get, Param, Query, Req } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppCommunityService } from './community.service'

@Controller('api/app/community')
export class AppCommunityController {
  constructor(private readonly community: AppCommunityService) {}

  /** 社区政策列表（featured 优先，数组非分页） */
  @Get('policies')
  policies(@Query('keyword') keyword?: string, @Query('category') category?: string) {
    return this.community.policies(keyword, category)
  }

  /** 人才库（社区个体且已公开名片） */
  @Get('talents')
  talents(@Req() req: AppAuthenticatedRequest, @Query('keyword') keyword?: string) {
    return this.community.talents(keyword, req.headers.authorization)
  }

  /** 公开人才名片（简历式；隐私开关过滤年龄/政治面貌） */
  @Get('talents/:uid')
  talentCard(@Req() req: AppAuthenticatedRequest, @Param('uid') uid: string) {
    return this.community.talentCard(uid, req.headers.authorization)
  }

  /** 企业库（展示页已发布且未归档） */
  @Get('enterprises')
  enterprises(@Req() req: AppAuthenticatedRequest, @Query('keyword') keyword?: string, @Query('industry') industry?: string) {
    return this.community.enterprises(keyword, industry, req.headers.authorization)
  }
}
