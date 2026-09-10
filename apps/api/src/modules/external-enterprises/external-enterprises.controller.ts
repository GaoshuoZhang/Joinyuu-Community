import { Controller, Get, Param, Query } from '@nestjs/common'
import { ExternalEnterprisesService, type ExternalEnterpriseDto } from './external-enterprises.service'
import { QueryExternalEnterprisesDto } from './dto/query-external-enterprises.dto'

@Controller('api/admin/external-enterprises')
export class ExternalEnterprisesController {
  constructor(private readonly externalEnterprises: ExternalEnterprisesService) {}

  @Get()
  list(@Query() query: QueryExternalEnterprisesDto): Promise<{ list: ExternalEnterpriseDto[]; total: number }> {
    return this.externalEnterprises.list(query)
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<ExternalEnterpriseDto> {
    return this.externalEnterprises.detail(id)
  }

  @Get(':id/stats')
  stats(@Param('id') id: string): Promise<{ demandCount: number; projectCount: number }> {
    return this.externalEnterprises.stats(id)
  }
}
