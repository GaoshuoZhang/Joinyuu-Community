import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { LoginLogsModule } from '../system/login-logs/login-logs.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AdminSessionService } from './admin-session.service'

/* 全局模块：JwtService 供全局 JwtAuthGuard 使用；JWT 有效期 2h（wiki-backend.md §6）。
 * 登录装载权限集合（RbacModule 全局）→ 校验走 PermissionGuard；
 * 会话索引（AdminSessionService）供会话管理与强踢；登录日志写入 LoginLogService。 */
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET 未配置：生产环境必须显式设置 JWT_SECRET（禁止使用开发默认值）')
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { expiresIn: '2h' },
    }),
    LoginLogsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminSessionService],
  exports: [JwtModule, AuthService, AdminSessionService],
})
export class AuthModule {}
