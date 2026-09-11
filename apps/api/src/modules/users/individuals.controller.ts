import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { UsersService } from './users.service'
import { QueryIndividualsDto } from './dto/query-individuals.dto'

@RequirePermission('/individuals')
@Controller('api/admin/individuals')
export class IndividualsController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: QueryIndividualsDto): Promise<{ list: unknown; total: number }> {
    return this.users.listIndividuals(query)
  }
}
