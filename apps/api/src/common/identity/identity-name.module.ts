import { Global, Module } from '@nestjs/common'
import { IdentityNameService } from './identity-name.service'

/* 身份名（username/nickname）唯一性与自动分配：全局模块，供 auth / me / users 复用 */
@Global()
@Module({ providers: [IdentityNameService], exports: [IdentityNameService] })
export class IdentityNameModule {}
