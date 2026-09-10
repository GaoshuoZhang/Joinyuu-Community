import { Module } from '@nestjs/common'
import { ExternalEnterprisesController } from './external-enterprises.controller'
import { ExternalEnterprisesService } from './external-enterprises.service'

@Module({
  controllers: [ExternalEnterprisesController],
  providers: [ExternalEnterprisesService],
})
export class ExternalEnterprisesModule {}
