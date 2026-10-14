import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { PreviewTemplateDto, TestTemplateDto } from './message-template.dto'

describe('消息模板预览与发送校验', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })
  const validate = (payload: unknown, metatype: typeof PreviewTemplateDto | typeof TestTemplateDto) =>
    pipe.transform(payload, { type: 'body', metatype })

  it('预览只需变量和可选版本，不要求收件人', async () => {
    await expect(validate({ variables: { code: '123456' }, version: 1 }, PreviewTemplateDto))
      .resolves.toEqual({ variables: { code: '123456' }, version: 1 })
  })

  it('测试发送仍拒绝缺少收件人的请求', async () => {
    await expect(validate({ variables: { code: '123456' } }, TestTemplateDto))
      .rejects.toBeInstanceOf(BadRequestException)
    await expect(validate({ recipient: 'e2e@example.invalid', variables: { code: '123456' } }, TestTemplateDto))
      .resolves.toEqual({ recipient: 'e2e@example.invalid', variables: { code: '123456' } })
  })

  it.each([{ version: 0 }, { variables: [] }])('预览拒绝不合法载荷 %j', async payload => {
    await expect(validate(payload, PreviewTemplateDto)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('预览剔除收件人等白名单外的字段', async () => {
    await expect(validate({ recipient: 'e2e@example.invalid', unexpected: true }, PreviewTemplateDto))
      .resolves.toEqual({})
  })
})
