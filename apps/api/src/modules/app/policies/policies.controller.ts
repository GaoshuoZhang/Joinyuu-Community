import { Controller, Get, Param } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import { AppPoliciesService } from './policies.service'

@Controller('api/app/policies')
export class AppPoliciesController {
  constructor(private readonly policies: AppPoliciesService) {}

  /** 协议版本下发（免登录）：kind=user_agreement | privacy_policy，返回最新 published 版本 */
  @Public()
  @Get(':kind')
  agreement(@Param('kind') kind: string) {
    return this.policies.agreement(kind)
  }
}
