import { Module, ValidationPipe } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from './common/prisma/prisma.module'
import { RedisModule } from './common/redis/redis.module'
import { IdGeneratorModule } from './common/id-generator/id-generator.module'
import { AuditModule } from './common/audit/audit.module'
import { PointsEngineModule } from './common/engine/points-engine/points-engine.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { EnterprisesModule } from './modules/enterprises/enterprises.module'
import { ExternalEnterprisesModule } from './modules/external-enterprises/external-enterprises.module'
import { ApplicationsModule } from './modules/applications/applications.module'
import { LedgersModule } from './modules/ledgers/ledgers.module'
import { DemandsModule } from './modules/demands/demands.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { EventsModule } from './modules/events/events.module'
import { SchedulerModule } from './scheduler/scheduler.module'
import { HealthController } from './health/health.controller'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor'
import { AuditInterceptor } from './common/interceptors/audit.interceptor'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    IdGeneratorModule,
    AuditModule,
    PointsEngineModule,
    AuthModule,
    UsersModule,
    EnterprisesModule,
    ExternalEnterprisesModule,
    ApplicationsModule,
    LedgersModule,
    DemandsModule,
    ProjectsModule,
    EventsModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ transform: true, whitelist: true }) },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
