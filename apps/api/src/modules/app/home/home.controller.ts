import { Controller, Get, Headers } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import { AppHomeService, type HomeFeedDto } from './home.service'

@Controller('api/app')
export class AppHomeController {
  constructor(private readonly homeService: AppHomeService) {}

  /** 首页聚合（@Public 或登录皆可；未读数登录时返回） */
  @Public()
  @Get('home')
  getHome(@Headers('authorization') authorization?: string): Promise<HomeFeedDto> {
    return this.homeService.home(authorization)
  }
}