import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AddressesService, type AddressItemDto } from './addresses.service'
import { AddressDto } from './dto/address.dto'

/* 收货地址（M2-R R1，/api/app/me/addresses）：
 * 列表/新增/更新/删除/设默认；均基于登录用户（req.user.sub）隔离 */
@Controller('api/app/me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@Req() req: AppAuthenticatedRequest): Promise<{ list: AddressItemDto[] }> {
    return this.addresses.list(this.uid(req))
  }

  @HttpCode(200)
  @Post()
  create(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: AddressDto,
  ): Promise<{ id: string }> {
    return this.addresses.create(this.uid(req), dto)
  }

  @Put(':id')
  update(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AddressDto,
  ): Promise<{ id: string }> {
    return this.addresses.update(this.uid(req), id, dto)
  }

  @HttpCode(200)
  @Delete(':id')
  remove(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ code: number }> {
    return this.addresses.remove(this.uid(req), id)
  }

  @HttpCode(200)
  @Post(':id/default')
  setDefault(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ code: number }> {
    return this.addresses.setDefault(this.uid(req), id)
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }
}