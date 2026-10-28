import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { BusinessChargeDto, businessChargeData, exclusivePriceData } from '../../common/dto/business-charge.dto'
import { CreateDemandDto } from '../demands/dto/create-demand.dto'
import { CreateProjectDto } from '../projects/dto/create-project.dto'
import { EventPayloadDto } from '../events/dto/event-payload.dto'
import { SpacePayloadDto } from '../spaces/dto/space-payload.dto'
import { GoodsPayloadDto } from '../mall/dto/goods-payload.dto'

describe('业务表单现金定价', () => {
  it('旧调用未传定价时保留原价；免费与收费均能保存', () => {
    expect(businessChargeData({})).toEqual({})
    expect(businessChargeData({ chargeAmountFen: 0, chargeRefundPolicy: '' })).toEqual({ chargeAmountFen: 0, chargeRefundPolicy: '' })
    expect(businessChargeData({ chargeAmountFen: 1, chargeRefundPolicy: '  开始前可退  ' })).toEqual({ chargeAmountFen: 1, chargeRefundPolicy: '开始前可退' })
  })
  it('拒绝负数、小数、超额、缺失或空白条款，以及单独清空条款', () => {
    for (const amount of [-1, 0.1, 100_000_001, NaN]) expect(() => businessChargeData({ chargeAmountFen: amount, chargeRefundPolicy: '约定' })).toThrow()
    expect(() => businessChargeData({ chargeAmountFen: 1, chargeRefundPolicy: ' ' })).toThrow()
    expect(() => businessChargeData({ chargeAmountFen: 1 })).toThrow()
    expect(() => businessChargeData({ chargeRefundPolicy: '' })).toThrow()
  })
  it('商品/空间只能使用一种价格，旧载荷也不能在现金记录上追加积分', () => {
    const cash = { chargeAmountFen: 100, chargeRefundPolicy: '未交付可退' }
    expect(() => exclusivePriceData(cash, 1)).toThrow('混合')
    expect(() => exclusivePriceData({}, 1, cash)).toThrow('混合')
    expect(exclusivePriceData(cash, 0, undefined, true)).toEqual(cash)
    expect(exclusivePriceData({ chargeAmountFen: 0, chargeRefundPolicy: '' }, 10, cash, true).chargeAmountFen).toBe(0)
    expect(() => exclusivePriceData({}, 0, undefined, true)).toThrow('售价')
    expect(exclusivePriceData({}, 0)).toEqual({})
  })
  it('需求和项目 DTO 不再接受收费字段', async () => {
    for (const Dto of [CreateDemandDto, CreateProjectDto] as Array<new () => object>) {
      const value = plainToInstance(Dto, { chargeAmountFen: 100, chargeRefundPolicy: '旧字段' })
      await validate(value, { whitelist: true, skipMissingProperties: true })
      expect(value).not.toHaveProperty('chargeAmountFen')
    }
  })
  const dtos: Array<new () => BusinessChargeDto> = [EventPayloadDto, SpacePayloadDto, GoodsPayloadDto]
  it.each(dtos)('%p 继承校验并保留白名单字段', async Dto => {
    const valid = plainToInstance(Dto, { chargeAmountFen: 100, chargeRefundPolicy: '取消可退' })
    const errors = await validate(valid, { whitelist: true, skipMissingProperties: true })
    expect(errors.filter(e => e.property.startsWith('charge'))).toHaveLength(0)
    expect(valid.chargeAmountFen).toBe(100)
    const invalid = plainToInstance(Dto, { chargeAmountFen: 0.1 })
    expect((await validate(invalid, { skipMissingProperties: true })).some(e => e.property === 'chargeAmountFen')).toBe(true)
  })
})
