import { Module } from '@nestjs/common'
import { GovernanceController } from './governance.controller'
import { GovernanceService } from './governance.service'
import { AgreementPoliciesController, CommunityPoliciesController } from './policies.controller'

@Module({ controllers: [GovernanceController, CommunityPoliciesController, AgreementPoliciesController], providers: [GovernanceService] })
export class GovernanceModule {}
