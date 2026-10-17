import DysmsapiClient, { SendSmsRequest } from '@alicloud/dysmsapi20170525'
import { Config as OpenApiConfig } from '@alicloud/openapi-client'
import { RuntimeOptions } from '@alicloud/tea-util'
import { sms } from 'tencentcloud-sdk-nodejs-sms'
import {
  MessageSendError,
  configString,
  resolveProviderTemplate,
  type MessageProvider,
} from './message-provider'
import type { ChannelKind, SendMessageInput, SendMessageResult } from '../messaging.types'

const ALIYUN_DEFAULT_ENDPOINT = 'dysmsapi.aliyuncs.com'
const TENCENT_DEFAULT_REGION = 'ap-guangzhou'
const TENCENT_ENDPOINT = 'sms.tencentcloudapi.com'

/** 阿里云短信（@alicloud/dysmsapi20170525）；凭据 accessKeyId/accessKeySecret 来自环境变量 */
export class AliyunSmsProvider implements MessageProvider {
  readonly provider = 'aliyun_sms'
  readonly supports: readonly ChannelKind[] = ['sms']

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const accessKeyId = input.credentials.accessKeyId
    const accessKeySecret = input.credentials.accessKeySecret
    if (!accessKeyId || !accessKeySecret) {
      throw new MessageSendError('阿里云短信凭据未配置（accessKeyId/accessKeySecret）', false)
    }
    const signName = configString(input.config, 'signName')
    if (!signName) throw new MessageSendError('阿里云短信未配置签名（signName）', false)
    const templateCode = resolveProviderTemplate(input.config, input.templateCode)

    const config = new OpenApiConfig({ accessKeyId, accessKeySecret })
    config.endpoint = configString(input.config, 'endpoint') || ALIYUN_DEFAULT_ENDPOINT
    const client = new DysmsapiClient(config)

    const request = new SendSmsRequest({
      phoneNumbers: input.recipient,
      signName,
      templateCode,
      templateParam: JSON.stringify(input.variables),
    })

    let response
    try {
      response = await client.sendSmsWithOptions(request, new RuntimeOptions({}))
    } catch (error) {
      throw new MessageSendError(`阿里云短信请求异常：${errorText(error)}`, true)
    }

    const code = response.body?.code
    if (code !== 'OK') {
      const message = response.body?.message ?? code ?? '未知错误'
      /* isp.* 为系统侧错误（可重试）；isv.* 多为模板/签名/号码业务错误（不重试，除限流） */
      const retriable = code === 'isv.BUSINESS_LIMIT_CONTROL' || (code?.startsWith('isp.') ?? false)
      throw new MessageSendError(`阿里云短信发送失败：${message}`, retriable)
    }
    return { providerMessageId: response.body?.bizId }
  }
}

/** 腾讯云短信（tencentcloud-sdk-nodejs-sms）；凭据 secretId/secretKey 来自环境变量 */
export class TencentSmsProvider implements MessageProvider {
  readonly provider = 'tencent_sms'
  readonly supports: readonly ChannelKind[] = ['sms']

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const secretId = input.credentials.secretId
    const secretKey = input.credentials.secretKey
    if (!secretId || !secretKey) {
      throw new MessageSendError('腾讯云短信凭据未配置（secretId/secretKey）', false)
    }
    const sdkAppId = configString(input.config, 'sdkAppId')
    const signName = configString(input.config, 'signName')
    if (!sdkAppId || !signName) {
      throw new MessageSendError('腾讯云短信未配置 SDKAppID / 签名', false)
    }
    const templateId = resolveProviderTemplate(input.config, input.templateCode)

    const SmsClient = sms.v20210111.Client
    const client = new SmsClient({
      credential: { secretId, secretKey },
      region: configString(input.config, 'region') || TENCENT_DEFAULT_REGION,
      profile: { httpProfile: { endpoint: TENCENT_ENDPOINT } },
    })

    /* 腾讯模板变量为位置参数（{1}/{2}…）：按配置的顺序取值，缺省按变量名升序稳定排列 */
    const order = templateParamOrder(input.config, input.templateCode, input.variables)
    const params = {
      PhoneNumberSet: [normalizeCnPhone(input.recipient)],
      SmsSdkAppId: sdkAppId,
      SignName: signName,
      TemplateId: templateId,
      TemplateParamSet: order.map((key) => input.variables[key] ?? ''),
    }

    let response
    try {
      response = await client.SendSms(params)
    } catch (error) {
      /* SDK 异常：错误码在 message 文本里（异常对象只带 requestId/traceId）；无法识别错误码时按「可重试」处理（多为网络/超时） */
      const info = tencentErrorInfo(error)
      throw new MessageSendError(
        `腾讯云短信请求异常：${info.text}${withRequestId(info.requestId)}`,
        info.code ? tencentRetriable(info.code) : true,
      )
    }

    const status = response.SendStatusSet?.[0]
    if (!status || status.Code !== 'Ok') {
      const code = status?.Code ?? ''
      const message = status?.Message ?? '未知错误'
      /* 单号失败同样按错误码命名空间判定可重试性；附上错误码与 RequestId 便于运维提工单 */
      throw new MessageSendError(
        `腾讯云短信发送失败：${message}${code ? `（错误码 ${code}）` : ''}${withRequestId(response.RequestId)}`,
        tencentRetriable(code),
      )
    }
    return { providerMessageId: status.SerialNo }
  }
}

/** 模板变量顺序：优先取 config.templateParamOrder[模板code]，缺省按变量名升序（保证幂等可复现） */
function templateParamOrder(
  config: Record<string, unknown>,
  templateCode: string,
  variables: Record<string, string>,
): string[] {
  const raw = config.templateParamOrder
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = (raw as Record<string, unknown>)[templateCode]
    if (Array.isArray(value)) return value.map((item) => String(item))
  }
  return Object.keys(variables).sort()
}

/** 腾讯云要求 +86 前缀（中国大陆）；已带国家码的原样透传 */
function normalizeCnPhone(phone: string): string {
  const trimmed = phone.trim()
  return trimmed.startsWith('+') ? trimmed : `+86${trimmed}`
}

/* 腾讯云 SendSms 错误码按命名空间判定可重试性（见腾讯云「发送短信」错误码表）：
 * LimitExceeded.*（限流）与 InternalError.*（系统侧）可重试；FailedOperation.* / InvalidParameterValue.* /
 * UnauthorizedOperation.* / UnsupportedOperation.* 属配置或业务错误，重试不会成功，只会浪费配额并刷日志。 */
const TENCENT_RETRIABLE_PREFIXES = ['LimitExceeded.', 'InternalError.'] as const

/** 是否可重试（空错误码按不可重试处理，避免对未知业务错误反复重投）——导出仅供单测 */
export function tencentRetriable(code: string): boolean {
  if (!code) return false
  if (code === 'FailedOperation.SendAndRecvFail') return true
  return TENCENT_RETRIABLE_PREFIXES.some((prefix) => code.startsWith(prefix))
}

/** 腾讯云 SDK 异常解析：错误码藏在 message 文本里（`Code=xxx` 或 JSON 的 `"code":"xxx"`），异常对象另带 requestId —— 导出仅供单测 */
export function tencentErrorInfo(error: unknown): { code: string; text: string; requestId: string } {
  const text = errorText(error)
  const match = /Code=([A-Za-z][A-Za-z0-9.]*)/.exec(text) ?? /"code"\s*:\s*"([A-Za-z][A-Za-z0-9.]*)"/.exec(text)
  const meta = error as { requestId?: string } | null
  return { code: match?.[1] ?? '', text, requestId: typeof meta?.requestId === 'string' ? meta.requestId : '' }
}

/** 错误文案后缀：带 RequestId，便于运维凭它向腾讯云提工单（文档明确要求提供 RequestId）—— 导出仅供单测 */
export function withRequestId(requestId?: string): string {
  return requestId ? `（RequestId：${requestId}）` : ''
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
