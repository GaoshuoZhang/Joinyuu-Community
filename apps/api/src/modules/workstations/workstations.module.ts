import { Module } from '@nestjs/common'
import { WorkstationsController } from './workstations.controller'
import { WorkstationAreasController } from './workstation-areas.controller'
import { WorkstationLeasesController } from './workstation-leases.controller'
import { LeasePrintController } from './lease-print.controller'
import { RenterOptionsController } from './renter-options.controller'
import { WorkstationsService } from './workstations.service'

@Module({
  controllers: [
    WorkstationsController,
    WorkstationAreasController,
    WorkstationLeasesController,
    LeasePrintController,
    RenterOptionsController,
  ],
  providers: [WorkstationsService],
})
export class WorkstationsModule {}
