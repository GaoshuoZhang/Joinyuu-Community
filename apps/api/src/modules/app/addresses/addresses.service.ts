import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type Address } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { formatNow } from '../../../common/utils/time'
import type { AddressDto } from './dto/address.dto'

export interface AddressItemDto {
  id: string
  name: string
  phone: string
  region: string
  detail: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/* 收货地址（M2-R R1，/api/app/me/addresses）：
 * 默认地址唯一由服务层保证；首条自动默认、isDefault=true 时事务清其他默认；
 * 删除默认地址后自动转移给最近更新的一个，无剩余则置空。 */
@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async list(userId: string): Promise<{ list: AddressItemDto[] }> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
    return { list: rows.map((a) => this.toItem(a)) }
  }

  async create(userId: string, dto: AddressDto): Promise<{ id: string }> {
    const now = formatNow()
    const id = await this.ids.next('AD')
    const count = await this.prisma.address.count({ where: { userId } })
    const isDefault = count === 0 ? true : dto.isDefault === true

    const normalized = this.normalizeAddress(dto)
    const data = {
      id,
      userId,
      name: dto.name,
      phone: dto.phone,
      region: normalized.region,
      detail: normalized.detail,
      createdAt: now,
      updatedAt: now,
    }

    /* 设默认需在事务内清其他默认，保证唯一 */
    if (isDefault) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.address.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          })
          await tx.address.create({ data: { ...data, isDefault: true } })
        })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
        await this.prisma.address.create({ data: { ...data, isDefault: false } })
      }
    } else {
      await this.prisma.address.create({ data: { ...data, isDefault: false } })
    }
    return { id }
  }

  async update(userId: string, id: string, dto: AddressDto): Promise<{ id: string }> {
    await this.requireAddress(userId, id)
    const normalized = this.normalizeAddress(dto)
    if (dto.isDefault === true) {
      await this.prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
        await tx.address.update({
          where: { id },
          data: {
            name: dto.name,
            phone: dto.phone,
            region: normalized.region,
            detail: normalized.detail,
            isDefault: true,
            updatedAt: formatNow(),
          },
        })
      })
    } else {
      await this.prisma.address.update({
        where: { id },
        data: {
          name: dto.name,
          phone: dto.phone,
          region: normalized.region,
          detail: normalized.detail,
          updatedAt: formatNow(),
        },
      })
    }
    return { id }
  }

  async remove(userId: string, id: string): Promise<{ code: number }> {
    await this.requireAddress(userId, id)
    const target = await this.prisma.address.findFirst({ where: { id, userId } })
    if (!target) throw new NotFoundException('地址不存在')

    /* 删除的是默认地址：若还有剩余则转移默认给最近更新的一个，否则置空 */
    if (target.isDefault) {
      const rest = await this.prisma.address.findMany({
        where: { userId, id: { not: id } },
        orderBy: { updatedAt: 'desc' },
      })
      await this.prisma.$transaction(async (tx) => {
        /* deleteMany 命中 0 行不抛错：并发重复删除保持幂等（原 delete 会抛 P2025 → 500） */
        await tx.address.deleteMany({ where: { id, userId } })
        if (rest.length > 0) {
          await tx.address.update({ where: { id: rest[0].id }, data: { isDefault: true } })
        }
      })
    } else {
      await this.prisma.address.deleteMany({ where: { id, userId } })
    }
    return { code: 0 }
  }

  async setDefault(userId: string, id: string): Promise<{ code: number }> {
    await this.requireAddress(userId, id)
    await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
      await tx.address.update({ where: { id }, data: { isDefault: true, updatedAt: formatNow() } })
    })
    return { code: 0 }
  }

  private async requireAddress(userId: string, id: string): Promise<void> {
    const exists = await this.prisma.address.findFirst({ where: { id, userId } })
    if (!exists) throw new NotFoundException('地址不存在')
  }

  private toItem(address: Address): AddressItemDto {
    return {
      id: address.id,
      name: address.name,
      phone: address.phone,
      region: address.region,
      detail: address.detail,
      isDefault: address.isDefault,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    }
  }

  private normalizeAddress(dto: AddressDto): { region: string; detail: string } {
    if (dto.address?.trim()) return { region: '', detail: dto.address.trim() }
    return { region: dto.region?.trim() ?? '', detail: dto.detail?.trim() ?? '' }
  }
}
