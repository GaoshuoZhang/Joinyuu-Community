import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { IndividualsController } from './individuals.controller'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController, IndividualsController],
  providers: [UsersService],
})
export class UsersModule {}
