import { Module } from '@nestjs/common'
import { AddressesController } from './addresses.controller'
import { AddressesService } from './addresses.service'

/* App 端收货地址（M2-R R1，/api/app/me/addresses） */
@Module({
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AppAddressesModule {}