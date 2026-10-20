import { parseIdentifier } from './identifier.util'

describe('parseIdentifier', () => {
  it('识别手机号并规整为 11 位数字', () => {
    expect(parseIdentifier('13801210001')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier(' 138 0121 0001 ')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier('138-0121-0001')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier('+8613801210001')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier('8613801210001')).toEqual({ kind: 'phone', value: '13801210001' })
  })

  it('识别邮箱并转小写', () => {
    expect(parseIdentifier('ChenYu@Starlan.AI')).toEqual({ kind: 'email', value: 'chenyu@starlan.ai' })
    expect(parseIdentifier(' chenyu@starlan.ai ')).toEqual({ kind: 'email', value: 'chenyu@starlan.ai' })
  })

  it('识别用户名并 trim + 小写', () => {
    expect(parseIdentifier('User_U1001')).toEqual({ kind: 'username', value: 'user_u1001' })
    expect(parseIdentifier(' user_u1001 ')).toEqual({ kind: 'username', value: 'user_u1001' })
  })

  it('不含分隔符/前缀的非法串按用户名处理（不误判为手机号）', () => {
    expect(parseIdentifier('abc-def')).toEqual({ kind: 'username', value: 'abc-def' })
    expect(parseIdentifier('86138012100')).toEqual({ kind: 'username', value: '86138012100' })
    expect(parseIdentifier('foo@bar')).toEqual({ kind: 'username', value: 'foo@bar' })
  })

  it('空串与纯空白返回 null', () => {
    expect(parseIdentifier('')).toBeNull()
    expect(parseIdentifier('   ')).toBeNull()
    expect(parseIdentifier(null)).toBeNull()
    expect(parseIdentifier(undefined)).toBeNull()
  })
})
