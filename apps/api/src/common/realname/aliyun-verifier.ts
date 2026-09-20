import CloudauthClient, { Id2MetaVerifyRequest } from '@alicloud/cloudauth20190307'
import { Config as OpenApiConfig } from '@alicloud/openapi-client'
import { RuntimeOptions } from '@alicloud/tea-util'
import {
  RealnameVerifyError,
  realnameConfigString,
  type RealnameProvider,
  type RealnameVerifier,
  type RealnameVerifyInput,
  type RealnameVerifyResult,
} from './realname-verifier'

/** 实人认证为区域化服务：官方示例使用区域 Endpoint（如 cn-beijing / cn-hangzhou）。
 * 后台「Endpoint」可按需覆盖，缺省取华北2（北京）。 */
const DEFAULT_ENDPOINT = 'cloudauth.cn-beijing.aliyuncs.com'

/** 阿里云实人认证 · 身份二要素核验（Id2MetaVerify）
 * 结果码 bizCode：1 一致 / 2 不一致 / 3 无此记录（body.code === '200' 表示请求成功） */
export class AliyunRealnameVerifier implements RealnameVerifier {
  readonly provider: RealnameProvider = 'aliyun'

  async verify(input: RealnameVerifyInput): Promise<RealnameVerifyResult> {
    const accessKeyId = input.credentials.accessKeyId
    const accessKeySecret = input.credentials.accessKeySecret
    if (!accessKeyId || !accessKeySecret) {
      throw new RealnameVerifyError('阿里云核验凭据未配置（accessKeyId/accessKeySecret）', false)
    }

    const config = new OpenApiConfig({ accessKeyId, accessKeySecret })
    config.endpoint = realnameConfigString(input.config, 'endpoint') || DEFAULT_ENDPOINT
    const client = new CloudauthClient(config)

    const request = new Id2MetaVerifyRequest({
      userName: input.realName,
      identifyNum: input.citizenId,
      paramType: 'normal',
    })

    let response
    try {
      response = await client.id2MetaVerifyWithOptions(request, new RuntimeOptions({}))
    } catch (error) {
      throw new RealnameVerifyError(`阿里云核验请求异常：${aliyunErrorText(error)}`, true)
    }

    const code = response.body?.code
    if (code !== '200') {
      throw new RealnameVerifyError(`阿里云核验失败：${response.body?.message ?? code ?? '未知错误'}`, true)
    }

    const bizCode = response.body?.resultObject?.bizCode
    return {
      outcome: bizCode === '1' ? 'match' : bizCode === '3' ? 'no_record' : 'mismatch',
      rawCode: bizCode,
      message: response.body?.message ?? undefined,
    }
  }
}

/** 提取 SDK 异常文本；官方示例建议同时输出 error.data["Recommend"] 便于自助排障 */
function aliyunErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const data = (error as { data?: Record<string, unknown> } | null | undefined)?.data
  const recommend = data?.Recommend ?? data?.recommend
  return recommend ? `${message}（建议：${String(recommend)}）` : message
}
