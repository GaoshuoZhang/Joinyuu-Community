import { Module } from '@nestjs/common'
import { DemandsController } from './demands.controller'
import { DemandResponsesController } from './demand-responses.controller'
import { PublisherOptionsController } from './publisher-options.controller'
import { DemandsService } from './demands.service'
import { ProjectsModule } from '../projects/projects.module'

@Module({
  imports: [ProjectsModule],
  controllers: [DemandsController, DemandResponsesController, PublisherOptionsController],
  providers: [DemandsService],
})
export class DemandsModule {}
