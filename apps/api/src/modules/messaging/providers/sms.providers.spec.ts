import { tencentErrorInfo, tencentRetriable, withRequestId } from './sms.providers'

/* 腾讯云短信错误处理（纯函数，无网络）：
 * 错误码取自腾讯云 SendSms 文档的错误码表，按命名空间决定是否重试，并把 RequestId 带进错误文案。 */

describe('tencentRetriable', () => {
  it('限流与系统类错误可重试（前缀匹配，带命名空间）', () => {
    expect(tencentRetriable('LimitExceeded.AppDailyLimit')).toBe(true)
    expect(tencentRetriable('LimitExceeded.PhoneNumberOneHourLimit')).toBe(true)
    expect(tencentRetriable('LimitExceeded.PhoneNumberThirtySecondLimit')).toBe(true)
    expect(tencentRetriable('InternalError.Timeout')).toBe(true)
    expect(tencentRetriable('InternalError.SendAndRecvFail')).toBe(true)
    expect(tencentRetriable('FailedOperation.SendAndRecvFail')).toBe(true)
  })

  it('配置 / 业务类错误不可重试（重试不会成功）', () => {
    expect(tencentRetriable('FailedOperation.TemplateParamSetNotMatchApprovedTemplate')).toBe(false)
    expect(tencentRetriable('FailedOperation.SignatureIncorrectOrUnapproved')).toBe(false)
    expect(tencentRetriable('InvalidParameterValue.IncorrectPhoneNumber')).toBe(false)
    expect(tencentRetriable('InvalidParameterValue.SdkAppIdNotExist')).toBe(false)
    expect(tencentRetriable('UnauthorizedOperation.ServiceSuspendDueToArrears')).toBe(false)
    expect(tencentRetriable('UnauthorizedOperation.RequestIpNotInWhitelist')).toBe(false)
    expect(tencentRetriable('UnsupportedOperation.UnsupportedRegion')).toBe(false)
  })

  it('空错误码视为不可重试（避免对未知业务错误反复重投）', () => {
    expect(tencentRetriable('')).toBe(false)
  })
})

describe('tencentErrorInfo', () => {
  it('从 SDK 异常文本提取错误码并读取 requestId', () => {
    const error = Object.assign(
      new Error('[TencentCloudSDKError] Code=FailedOperation.SignatureIncorrectOrUnapproved, Message=签名未审批或格式错误'),
      { requestId: 'a0aabda6-cf91-4f3e-a81f-9198114a2279' },
    )
    const info = tencentErrorInfo(error)
    expect(info.code).toBe('FailedOperation.SignatureIncorrectOrUnapproved')
    expect(info.requestId).toBe('a0aabda6-cf91-4f3e-a81f-9198114a2279')
    expect(info.text).toContain('签名未审批或格式错误')
  })

  it('JSON 形态的错误码同样可提取', () => {
    const error = new Error('{"code":"InvalidParameterValue.SdkAppIdNotExist","message":"SdkAppId 不存在。"}')
    expect(tencentErrorInfo(error).code).toBe('InvalidParameterValue.SdkAppIdNotExist')
  })

  it('无法识别错误码时留空（调用方按网络类错误处理）且 requestId 为空串', () => {
    const info = tencentErrorInfo(new Error('socket hang up'))
    expect(info.code).toBe('')
    expect(info.requestId).toBe('')
    expect(info.text).toBe('socket hang up')
  })
})

describe('withRequestId', () => {
  it('有 RequestId 时拼接、没有时不加后缀', () => {
    expect(withRequestId('r-123')).toBe('（RequestId：r-123）')
    expect(withRequestId('')).toBe('')
    expect(withRequestId(undefined)).toBe('')
  })
})
