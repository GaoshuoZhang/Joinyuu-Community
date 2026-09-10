import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { EnterprisesService, type EnterpriseDto } from './enterprises.service'
import { QueryEnterprisesDto } from './dto/query-enterprises.dto'
import { ReviewShowcaseDto } from './dto/review-showcase.dto'

@Controller('api/admin/enterprises')
export class EnterprisesController {
  constructor(private readonly enterprises: EnterprisesService) {}

  @Get('options')
  options(): Promise<Array<{ label: string; value: string }>> {
    return this.enterprises.options()
  }

  @Get()
  list(@Query() query: QueryEnterprisesDto): Promise<{ list: EnterpriseDto[]; total: number }> {
    return this.enterprises.list(query)
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<{ enterprise: EnterpriseDto; members: unknown }> {
    return this.enterprises.detail(id)
  }

  @Get(':id/stats')
  stats(@Param('id') id: string): Promise<{ demandCount: number; projectCount: number }> {
    return this.enterprises.stats(id)
  }

  @Patch(':id/showcase-status')
  reviewShowcase(@Param('id') id: string, @Body() dto: ReviewShowcaseDto): Promise<{ code: number }> {
    return this.enterprises.reviewShowcase(id, dto)
  }
}
