import { Module } from '@nestjs/common'
import { ContentsController } from './contents.controller'
import { ContentsService } from './contents.service'
import { AnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'

@Module({
  controllers: [ContentsController, AnnouncementsController],
  providers: [ContentsService, AnnouncementsService],
})
export class ContentsModule {}
