import { Global, Module } from '@nestjs/common'
import { PointsEngineService } from './points-engine.service'

/* 全局模块：积分/经验值发放引擎（wiki-backend.md §8.4），供各业务模块注入 */
@Global()
@Module({
  providers: [PointsEngineService],
  exports: [PointsEngineService],
})
export class PointsEngineModule {}
