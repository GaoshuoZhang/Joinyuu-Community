import { describe, expect, it } from 'vitest'
import { parseIdentifier } from './validators'

/* 登录标识解析必须与后端 apps/api/src/modules/app/auth/identifier.util.ts 同口径：
 * 两端口径漂移会出现「客户端按邮箱提交、服务端按用户名查询」的静默失败。 */
describe('parseIdentifier', () => {
  it('识别手机号并规整为 11 位数字', () => {
    expect(parseIdentifier('13801210001')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier(' 138 0121 0001 ')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier('138-0121-0001')).toEqual({ kind: 'phone', value: '13801210001' })
    expect(parseIdentifier('+8613801210001')).toEqual({ kind: 'phone', value: '13801210001' })
  })

  it('识别邮箱并转小写', () => {
    expect(parseIdentifier('ChenYu@Starlan.AI')).toEqual({ kind: 'email', value: 'chenyu@starlan.ai' })
  })

  it('识别用户名并 trim + 小写', () => {
    expect(parseIdentifier(' User_U1001 ')).toEqual({ kind: 'username', value: 'user_u1001' })
  })

  it('含分隔符的非法串按用户名处理（不误判为手机号）', () => {
    expect(parseIdentifier('abc-def')).toEqual({ kind: 'username', value: 'abc-def' })
    expect(parseIdentifier('foo@bar')).toEqual({ kind: 'username', value: 'foo@bar' })
  })

  it('空串与纯空白返回 null', () => {
    expect(parseIdentifier('')).toBeNull()
    expect(parseIdentifier('   ')).toBeNull()
    expect(parseIdentifier(undefined)).toBeNull()
  })
})
