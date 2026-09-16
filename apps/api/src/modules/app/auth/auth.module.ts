import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

/* 移动端鉴权模块（/api/app/auth）：
 * 依赖均为全局模块（Prisma/Redis/IdGenerator/PointsEngine/Notification/JwtModule），无需额外 imports。
 * 鉴权由全局 AppJwtGuard 承担（仅 /api/app/**），登录/注册/验证码/找回密码端点用 @Public() 豁免。 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppAuthModule {}