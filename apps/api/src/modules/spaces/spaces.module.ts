import { Module } from '@nestjs/common'
import { SpacesController } from './spaces.controller'
import { SpaceReservationsController } from './space-reservations.controller'
import { SpacesService } from './spaces.service'

@Module({
  controllers: [SpacesController, SpaceReservationsController],
  providers: [SpacesService],
})
export class SpacesModule {}
