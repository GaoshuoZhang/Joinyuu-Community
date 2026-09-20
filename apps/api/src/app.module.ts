import { Module, ValidationPipe } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { validationExceptionFactory } from './common/pipes/validation-exception.factory'
import { PrismaModule } from './common/prisma/prisma.module'
import { RedisModule } from './common/redis/redis.module'
import { IdGeneratorModule } from './common/id-generator/id-generator.module'
import { AuditModule } from './common/audit/audit.module'
import { RbacModule } from './common/rbac/rbac.module'
import { StorageModule } from './common/storage/storage.module'
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
import { MallModule } from './modules/mall/mall.module'
import { RulesModule } from './modules/rules/rules.module'
import { WorkstationsModule } from './modules/workstations/workstations.module'
import { SpacesModule } from './modules/spaces/spaces.module'
import { ContentsModule } from './modules/contents/contents.module'
import { SystemModule } from './modules/system/system.module'
import { RolesModule } from './modules/system/roles/roles.module'
import { AdminsModule } from './modules/system/admins/admins.module'
import { LoginLogsModule } from './modules/system/login-logs/login-logs.module'
import { MonitorModule } from './modules/system/monitor/monitor.module'
import { TrashModule } from './modules/system/trash/trash.module'
import { ExportModule } from './modules/system/export/export.module'
import { AssetsModule } from './modules/assets/assets.module'
import { GovernanceModule } from './modules/governance/governance.module'
import { NotificationModule } from './common/notify/notification.module'
import { AppSessionModule } from './common/app-session/app-session.module'
import { AppAuthModule } from './modules/app/auth/auth.module'
import { AppMeModule } from './modules/app/me/me.module'
import { AppConfigModule } from './modules/app/config/config.module'
import { AppNoticesModule } from './modules/app/notices/notices.module'
import { AppAddressesModule } from './modules/app/addresses/addresses.module'
import { AppDemandsModule } from './modules/app/demands/demands.module'
import { AppProjectsModule } from './modules/app/projects/projects.module'
import { AppEventsModule } from './modules/app/events/events.module'
import { AppMallModule } from './modules/app/mall/mall.module'
import { AppSpacesModule } from './modules/app/spaces/spaces.module'
import { AppContentsModule } from './modules/app/contents/contents.module'
import { AppApplicationsModule } from './modules/app/applications/applications.module'
import { AppHomeModule } from './modules/app/home/home.module'
import { AppSearchModule } from './modules/app/search/search.module'
import { AppUploadsModule } from './modules/app/uploads/uploads.module'
import { AppRealnameModule } from './modules/app/realname/realname.module'
import { AppEnterprisesModule } from './modules/app/enterprises/enterprises.module'
import { AppCommunityModule } from './modules/app/community/community.module'
import { AppFavoritesModule } from './modules/app/favorites/favorites.module'
import { AppPoliciesModule } from './modules/app/policies/policies.module'
import { AppLeasesModule } from './modules/app/leases/leases.module'
import { EngagementModule } from './modules/app/engagement/engagement.module'
import { MessagingModule } from './modules/messaging/messaging.module'
import { SchedulerModule } from './scheduler/scheduler.module'
import { HealthController } from './health/health.controller'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { AppJwtGuard } from './common/guards/app-jwt.guard'
import { PermissionGuard } from './common/guards/permission.guard'
import { DomainScopeGuard } from './common/guards/domain-scope.guard'
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor'
import { AuditInterceptor } from './common/interceptors/audit.interceptor'
import { AppAnalyticsInterceptor } from './common/interceptors/app-analytics.interceptor'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

@Module({
  imports: [
    // Tests invoke scheduler methods explicitly; wall-clock jobs race suite teardown/reseeding.
    ScheduleModule.forRoot({ cronJobs: process.env.NODE_ENV !== 'test' }),
    PrismaModule,
    RedisModule,
    IdGeneratorModule,
    AuditModule,
    RbacModule,
    StorageModule,
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
    MallModule,
    RulesModule,
    WorkstationsModule,
    SpacesModule,
    ContentsModule,
    SystemModule,
    RolesModule,
    AdminsModule,
    LoginLogsModule,
    MonitorModule,
    TrashModule,
    ExportModule,
    AssetsModule,
    GovernanceModule,
    NotificationModule,
    AppSessionModule,
    AppAuthModule,
    AppMeModule,
    AppConfigModule,
    AppNoticesModule,
    AppAddressesModule,
    AppDemandsModule,
    AppProjectsModule,
    AppEventsModule,
    AppMallModule,
    AppSpacesModule,
    AppContentsModule,
    AppApplicationsModule,
    AppHomeModule,
    AppSearchModule,
    AppUploadsModule,
    AppRealnameModule,
    AppEnterprisesModule,
    AppCommunityModule,
    AppFavoritesModule,
    AppPoliciesModule,
    AppLeasesModule,
    EngagementModule,
    MessagingModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true, exceptionFactory: validationExceptionFactory }),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppJwtGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: DomainScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AppAnalyticsInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
