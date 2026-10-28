import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { CommerceQueryDto, CreateCommerceBillDto, RegisterReceiptDto } from './commerce.dto'

@Injectable()
export class CommerceService {
  constructor(private readonly db: PrismaService, private readonly ids: IdGeneratorService) {}

  private async audit(tx: Prisma.TransactionClient, actor: string, action: string, target: string, detail = '') {
    await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '交易经营', action, target, detail, operator: actor, at: formatNow() } })
  }

  async source(module: string, id: string, tx: Prisma.TransactionClient = this.db) {
    if (module === 'demand' || module === 'project') throw new BadRequestException('需求和项目收费方式待确定，暂不支持新建收费账单')
    const where = { id, deletedAt: null }
    const row = module === 'demand' ? await tx.demand.findFirst({ where })
      : module === 'project' ? await tx.project.findFirst({ where })
      : module === 'lease' ? await tx.lease.findFirst({ where })
      : module === 'space' ? await tx.space.findFirst({ where })
      : module === 'event' ? await tx.communityEvent.findFirst({ where })
      : module === 'mall' ? await tx.mallGoods.findFirst({ where }) : null
    if (!row) throw new NotFoundException('关联业务不存在或已归档')
    const name = 'title' in row ? row.title : 'name' in row ? row.name : row.renterName
    const amountFen = 'monthlyRent' in row ? row.monthlyRent * 100 : row.chargeAmountFen
    const unit = 'rentPeriod' in row ? ({ day: '天', week: '周', month: '月', year: '年' }[row.rentPeriod] ?? '期')
      : ({ demand: '项', project: '项', space: '小时', event: '人次', mall: '件' }[module] ?? '项')
    const refundPolicy = 'chargeRefundPolicy' in row ? row.chargeRefundPolicy : '按租约约定执行，出账前请确认具体退款条款'
    return { id, name, amountFen, unit, refundPolicy }
  }

  async options(module: string, keyword: string) {
    const filter = { deletedAt: null }
    const find = { take: 30, orderBy: { id: 'desc' as const } }
    const rows = module === 'demand' ? await this.db.demand.findMany({ ...find, where: { ...filter, title: { contains: keyword } }, select: { id: true, title: true } }).then(r => r.map(x => ({ id: x.id, name: x.title })))
      : module === 'project' ? await this.db.project.findMany({ ...find, where: { ...filter, name: { contains: keyword } }, select: { id: true, name: true } })
      : module === 'lease' ? await this.db.lease.findMany({ ...find, where: { ...filter, renterName: { contains: keyword } }, select: { id: true, renterName: true } }).then(r => r.map(x => ({ id: x.id, name: x.renterName })))
      : module === 'space' ? await this.db.space.findMany({ ...find, where: { ...filter, name: { contains: keyword } }, select: { id: true, name: true } })
      : module === 'event' ? await this.db.communityEvent.findMany({ ...find, where: { ...filter, title: { contains: keyword } }, select: { id: true, title: true } }).then(r => r.map(x => ({ id: x.id, name: x.title })))
      : await this.db.mallGoods.findMany({ ...find, where: { ...filter, name: { contains: keyword } }, select: { id: true, name: true } })
    return rows
  }

  async buyers(type: string, keyword: string) {
    return type === 'user'
      ? this.db.user.findMany({ where: { status: 'active', nickname: { contains: keyword } }, take: 30, select: { uid: true, nickname: true } }).then(r => r.map(x => ({ id: x.uid, name: x.nickname })))
      : this.db.enterprise.findMany({ where: { deletedAt: null, status: { not: 'disabled' }, name: { contains: keyword } }, take: 30, select: { id: true, name: true } })
  }

  async createBill(dto: CreateCommerceBillDto, actor: string) {
    if (![dto.title, dto.period, dto.agreement].every(x => x.trim())) throw new BadRequestException('账单标题、账期及收费依据不能为空')
    const due = new Date(`${dto.dueDate}T00:00:00Z`)
    if (!Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== dto.dueDate) throw new BadRequestException('到期日期无效')
    const businessKey = createHash('sha256').update(JSON.stringify([dto.module, dto.sourceId, dto.buyerType, dto.buyerId, dto.period.trim(), dto.title.trim()])).digest('hex')
    try {
      return await this.db.$transaction(async tx => {
        const pricing = await this.source(dto.module, dto.sourceId, tx)
        const quantity = dto.quantity ?? 1
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new BadRequestException('计费数量须为 1 至 10000 的整数')
        const expectedAmount = pricing.amountFen * quantity
        if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || expectedAmount > 100_000_000) throw new BadRequestException('请先在关联业务的新增/编辑页面设置有效现金收费金额；账单总额不能超过 100 万元')
        if (dto.amountFen !== expectedAmount) throw new BadRequestException('业务价格已变更，请重新选择关联业务并核对金额')
        const buyerName = dto.buyerType === 'user'
          ? (await tx.user.findFirst({ where: { uid: dto.buyerId, status: 'active' } }))?.nickname
          : (await tx.enterprise.findFirst({ where: { id: dto.buyerId, deletedAt: null, status: { not: 'disabled' } } }))?.name
        if (!buyerName) throw new BadRequestException('购买主体不存在或已停用')
        const id = await this.ids.next('CB', tx)
        const bill = await tx.commerceBill.create({ data: { id, businessKey, module: dto.module, sourceId: dto.sourceId, sourceName: pricing.name, buyerType: dto.buyerType, buyerId: dto.buyerId, buyerName, title: dto.title.trim(), period: dto.period.trim(), amountFen: dto.amountFen, dueDate: dto.dueDate, createdBy: actor, snapshot: { agreement: dto.agreement.trim(), pricing: { unitAmountFen: pricing.amountFen, quantity, unit: pricing.unit, refundPolicy: pricing.refundPolicy } } } })
        await this.audit(tx, actor, '创建应收账单', id, `${dto.amountFen} 分；${dto.period}`)
        return bill
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('同业务、主体、账期和费用已出账，请勿重复创建')
      throw e
    }
  }

  private billWhere(q: CommerceQueryDto): Prisma.CommerceBillWhereInput {
    return { ...(q.sourceId ? { sourceId: q.sourceId } : {}), ...(q.module ? { module: q.module } : {}), ...(q.status === 'overdue' ? { status: 'unpaid', dueDate: { lt: formatToday() } } : q.status ? { status: q.status } : {}), ...(q.keyword ? { OR: ['id', 'title', 'buyerName', 'sourceName'].map(key => ({ [key]: { contains: q.keyword } })) } : {}) }
  }

  async bills(query: CommerceQueryDto) {
    const where = this.billWhere(query)
    const [list, total] = await this.db.$transaction([
      this.db.commerceBill.findMany({ where, include: { payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.db.commerceBill.count({ where }),
    ])
    return { list: list.map(b => ({ ...b, overdue: b.status === 'unpaid' && b.dueDate < formatToday() })), total }
  }

  async detail(id: string) {
    const row = await this.db.commerceBill.findUnique({ where: { id }, include: { receipts: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { createdAt: 'desc' }, include: { refunds: { orderBy: { createdAt: 'desc' } } } } } })
    if (!row) throw new NotFoundException('账单不存在')
    return row
  }

  async voidBill(id: string, actor: string) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${id} FOR UPDATE`
      const bill = await tx.commerceBill.findUnique({ where: { id }, include: { payments: true, receipts: true } })
      if (!bill) throw new NotFoundException('账单不存在')
      if (bill.status !== 'unpaid' || bill.paidFen || bill.payments.some(x => x.status !== 'closed') || bill.receipts.some(x => x.status === 'pending')) throw new ConflictException('仅无收款、无未关闭支付且无待复核收款的账单可作废')
      await tx.commerceBill.update({ where: { id }, data: { status: 'void' } })
      await this.audit(tx, actor, '作废账单', id)
      return { code: 0 }
    })
  }

  async receipt(id: string, dto: RegisterReceiptDto, actor: string) {
    if (!dto.reference.trim() || !dto.note.trim()) throw new BadRequestException('凭证编号及说明不能为空')
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${id} FOR UPDATE`
        const bill = await tx.commerceBill.findUnique({ where: { id }, include: { payments: true, receipts: true } })
        if (!bill) throw new NotFoundException('账单不存在')
        if (bill.status !== 'unpaid' || bill.payments.some(x => x.status !== 'closed') || bill.receipts.some(x => x.status === 'pending')) throw new ConflictException('当前账单不可登记收款（存在支付单或待复核收款）')
        const row = await tx.commerceReceipt.create({ data: { id: await this.ids.next('CR', tx), billId: id, amountFen: bill.amountFen, reference: dto.reference.trim(), note: dto.note.trim(), createdBy: actor } })
        await this.audit(tx, actor, '登记线下收款', id, row.id)
        return row
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('收款凭证已登记')
      throw e
    }
  }

  async reviewReceipt(id: string, status: 'approved' | 'rejected', actor: string) {
    return this.db.$transaction(async tx => {
      const receipt = await tx.commerceReceipt.findUnique({ where: { id } })
      if (!receipt) throw new NotFoundException('收款登记不存在')
      await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${receipt.billId} FOR UPDATE`
      if (receipt.createdBy === actor) throw new ConflictException('请由另一位有复核权限的管理员复核')
      const changed = await tx.commerceReceipt.updateMany({ where: { id, status: 'pending' }, data: { status, reviewedBy: actor, reviewedAt: new Date() } })
      if (!changed.count) throw new ConflictException('收款记录已复核')
      if (status === 'approved') {
        const bill = await tx.commerceBill.updateMany({ where: { id: receipt.billId, status: 'unpaid', paidFen: 0 }, data: { paidFen: receipt.amountFen, status: 'paid' } })
        if (!bill.count) throw new ConflictException('账单状态已变化')
      }
      await this.audit(tx, actor, status === 'approved' ? '确认线下收款' : '驳回线下收款', receipt.billId, id)
      return { code: 0 }
    })
  }

  async overview() {
    const [amounts, unpaid, overdue, pendingReceipts, pendingPayments] = await this.db.$transaction([
      this.db.commerceBill.aggregate({ _sum: { paidFen: true, refundedFen: true } }),
      this.db.commerceBill.aggregate({ where: { status: 'unpaid' }, _sum: { amountFen: true }, _count: true }),
      this.db.commerceBill.count({ where: { status: 'unpaid', dueDate: { lt: formatToday() } } }),
      this.db.commerceReceipt.count({ where: { status: 'pending' } }),
      this.db.commercePayment.count({ where: { status: 'pending' } }),
    ])
    return { paidFen: amounts._sum.paidFen ?? 0, refundedFen: amounts._sum.refundedFen ?? 0, unpaidFen: unpaid._sum.amountFen ?? 0, unpaidCount: unpaid._count, overdueCount: overdue, pendingReceipts, pendingPayments }
  }
}
