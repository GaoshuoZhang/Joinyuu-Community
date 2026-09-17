import { Module } from '@nestjs/common'
import { MemberGovernanceController, UsersController } from './users.controller'
import { IndividualsController } from './individuals.controller'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController, MemberGovernanceController, IndividualsController],
  providers: [UsersService],
})
export class UsersModule {}
