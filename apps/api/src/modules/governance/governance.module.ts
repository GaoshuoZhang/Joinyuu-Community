import { Module } from '@nestjs/common'
import { GovernanceService } from './governance.service'
import { AgreementPoliciesController, CommunityPoliciesController } from './policies.controller'

@Module({ controllers: [CommunityPoliciesController, AgreementPoliciesController], providers: [GovernanceService] })
export class GovernanceModule {}
