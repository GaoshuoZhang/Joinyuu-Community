import { Module } from '@nestjs/common'
import { ContentsController } from './contents.controller'
import { ContentsService } from './contents.service'
import { AnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'
import { BannersController } from './banners.controller'
import { BannersService } from './banners.service'

@Module({
  controllers: [ContentsController, AnnouncementsController, BannersController],
  providers: [ContentsService, AnnouncementsService, BannersService],
})
export class ContentsModule {}
