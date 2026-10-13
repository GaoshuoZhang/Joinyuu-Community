import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { WorkstationsService, type LeaseDto } from './workstations.service'
import type { MallAssetDto, UploadedFileLike } from '../assets/assets.service'
import { LeasePayloadDto } from './dto/lease-payload.dto'
import { LeaseUpdateDto } from './dto/lease-update.dto'
import { LeaseRenewDto } from './dto/lease-renew.dto'

@RequirePermission('/workstations/leases')
@Controller('api/admin/workstation-leases')
export class WorkstationLeasesController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get()
  findLeases(): Promise<LeaseDto[]> {
    return this.workstations.findLeases()
  }

  @Get(':id')
  leaseDetail(@Param('id') id: string): Promise<LeaseDto> {
    return this.workstations.leaseDetail(id)
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: LeasePayloadDto, @Req() req: AuthenticatedRequest): Promise<LeaseDto> {
    return this.workstations.createLease(dto, req.user?.name ?? '社区管理员')
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: LeaseUpdateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.workstations.updateLease(id, dto, req.user?.name ?? '社区管理员')
  }

  /** 续期：延长到期日并写续期记录（已终止/长期租约不可续期） */
  @HttpCode(200)
  @Post(':id/renew')
  renew(
    @Param('id') id: string,
    @Body() dto: LeaseRenewDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.workstations.renewLease(id, dto, req.user?.name ?? '社区管理员')
  }

  /** 线下纸质合同扫描件（图片/PDF）：列表 */
  @Get(':id/contracts')
  contracts(@Param('id') id: string): Promise<MallAssetDto[]> {
    return this.workstations.leaseContracts(id)
  }

  /** 上传合同扫描件（multipart，字段名 file）；大小上限取系统配置 uploadMaxSizeMb */
  @HttpCode(200)
  @Post(':id/contracts')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  uploadContract(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike,
    @Req() req: AuthenticatedRequest,
  ): Promise<MallAssetDto> {
    return this.workstations.uploadLeaseContract(id, file, req.user?.name ?? '社区管理员')
  }

  /** 删除合同扫描件（仅限该租约名下附件） */
  @HttpCode(200)
  @Delete(':id/contracts/:assetId')
  removeContract(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.workstations.removeLeaseContract(id, assetId, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/terminate')
  terminate(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.workstations.terminateLease(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.workstations.archive(id, req.user?.name ?? '社区管理员')
  }
}