import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { RequirePermission } from '../decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'
import { LicenseService } from './license.service'
import { LicenseMaintenance } from './license.guard'

class RequestLicenseDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  customerName!: string
}
class ImportLicenseDto {
  @IsString() @IsNotEmpty() @MaxLength(32768)
  content!: string
}

@RequirePermission('/system/config')
@Controller('api/admin/system/license')
export class LicenseController {
  constructor(private readonly license: LicenseService) {}
  @Get()
  status() { return this.license.status() }
  @Post('request') @HttpCode(200) @LicenseMaintenance()
  request(@Body() dto: RequestLicenseDto) { return this.license.request(dto.customerName) }
  @Post('import') @HttpCode(200) @LicenseMaintenance()
  import(@Body() dto: ImportLicenseDto, @Req() req: AuthenticatedRequest) {
    return this.license.importFile(dto.content, req.user!.name)
  }
}
