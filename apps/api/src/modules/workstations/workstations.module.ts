import { Module } from '@nestjs/common'
import { WorkstationsController } from './workstations.controller'
import { WorkstationAreasController } from './workstation-areas.controller'
import { WorkstationLeasesController } from './workstation-leases.controller'
import { RenterOptionsController } from './renter-options.controller'
import { WorkstationsService } from './workstations.service'

@Module({
  controllers: [
    WorkstationsController,
    WorkstationAreasController,
    WorkstationLeasesController,
    RenterOptionsController,
  ],
  providers: [WorkstationsService],
})
export class WorkstationsModule {}
