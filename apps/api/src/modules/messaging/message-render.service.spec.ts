import { MessageRenderService } from './message-render.service'

/* 短信参数集：只传模板正文实际引用的变量（顺序 = 正文出现顺序）。
 * 供应商模板按位置传参（腾讯 {1}/{2}），参数个数不符会被拒绝，因此这里是发信成功的关键约束。 */

describe('MessageRenderService.pickUsed', () => {
  const render = new MessageRenderService()

  it('只保留正文实际引用的变量，键顺序 = 正文出现顺序', () => {
    const picked = render.pickUsed(undefined, '您的验证码：{{code}}，{{minutes}} 分钟内有效', {
      code: '123456',
      minutes: '5',
      unused: 'x',
    })
    expect(Object.keys(picked)).toEqual(['code', 'minutes'])
    expect(picked).toEqual({ code: '123456', minutes: '5' })
  })

  it('单变量模板只产出 1 个参数（腾讯单变量验证码模板场景）', () => {
    const picked = render.pickUsed(undefined, '您的验证码：{{code}}，如非本人操作，请忽略本短信！', {
      code: '123456',
      minutes: '5',
    })
    expect(Object.keys(picked)).toEqual(['code'])
  })

  it('单花括号 {code} 不是占位符，不被识别（模板写错时参数个数为 0）', () => {
    expect(render.pickUsed(undefined, '您的验证码：{code}', { code: '123456' })).toEqual({})
  })

  it('主题中的变量也会纳入（邮件场景），正文顺序优先', () => {
    const picked = render.pickUsed('【{{brand}}】验证码', '验证码 {{code}}', { code: '1', brand: 'Joinyuu' })
    expect(Object.keys(picked)).toEqual(['code', 'brand'])
  })

  it('正文与主题均无占位符时返回空对象', () => {
    expect(render.pickUsed(undefined, '纯文本', { code: '1' })).toEqual({})
  })
})
