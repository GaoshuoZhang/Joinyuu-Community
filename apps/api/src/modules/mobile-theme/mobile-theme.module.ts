import { Module } from '@nestjs/common'
import { MobileThemeService } from './mobile-theme.service'
import { MobileThemeAdminController, MobileThemeAppController, MobileThemeAssetsController } from './mobile-theme.controller'

@Module({ controllers: [MobileThemeAdminController, MobileThemeAppController, MobileThemeAssetsController], providers: [MobileThemeService] })
export class MobileThemeModule {}
