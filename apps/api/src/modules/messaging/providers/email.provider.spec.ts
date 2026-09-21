import { parseFromLine } from './email.provider'

/* SMTP 发件人解析与一致性判定（纯函数，无网络）。 */

describe('parseFromLine', () => {
  it('解析「显示名 <邮箱>」格式', () => {
    expect(parseFromLine('聚屿社区 <no-reply@example.com>')).toEqual({
      fromName: '聚屿社区',
      fromAddress: 'no-reply@example.com',
    })
  })

  it('解析带引号显示名', () => {
    expect(parseFromLine('"Community" <a@b.com>')).toEqual({ fromName: 'Community', fromAddress: 'a@b.com' })
  })

  it('解析纯邮箱（无显示名）', () => {
    expect(parseFromLine('no-reply@example.com')).toEqual({ fromName: '', fromAddress: 'no-reply@example.com' })
  })

  it('容忍空格与空显示名', () => {
    expect(parseFromLine('  < a@b.com >  ')).toEqual({ fromName: '', fromAddress: 'a@b.com' })
  })

  it('无法识别为邮箱时整体作为地址', () => {
    expect(parseFromLine('not-an-email')).toEqual({ fromName: '', fromAddress: 'not-an-email' })
  })
})