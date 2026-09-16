import { Global, Module } from '@nestjs/common'
import { AppSessionService } from './app-session.service'

@Global()
@Module({ providers: [AppSessionService], exports: [AppSessionService] })
export class AppSessionModule {}
