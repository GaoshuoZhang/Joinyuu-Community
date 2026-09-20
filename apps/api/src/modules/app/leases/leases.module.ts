import { Module } from '@nestjs/common'
import { AppLeasesController } from './leases.controller'
import { AppLeasesService } from './leases.service'

@Module({
  controllers: [AppLeasesController],
  providers: [AppLeasesService],
})
export class AppLeasesModule {}
