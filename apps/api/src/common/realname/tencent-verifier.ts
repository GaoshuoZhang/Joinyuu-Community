import { faceid } from 'tencentcloud-sdk-nodejs-faceid'
import {
  RealnameVerifyError,
  realnameConfigString,
  type RealnameProvider,
  type RealnameVerifier,
  type RealnameVerifyInput,
  type RealnameVerifyResult,
} from './realname-verifier'

const DEFAULT_REGION = 'ap-guangzhou'
const DEFAULT_ENDPOINT = 'faceid.tencentcloudapi.com'

/** 腾讯云人脸核身 · 身份信息认证（IdCardVerification）
 * Result：0 一致 / -1 不一致 / -2 非法身份证号 / -3 非法姓名 / -5 无此身份证记录；
 * -4/-6/-7 等为证件库或系统侧异常（可重试）。 */
export class TencentRealnameVerifier implements RealnameVerifier {
  readonly provider: RealnameProvider = 'tencent'

  async verify(input: RealnameVerifyInput): Promise<RealnameVerifyResult> {
    const secretId = input.credentials.secretId
    const secretKey = input.credentials.secretKey
    if (!secretId || !secretKey) {
      throw new RealnameVerifyError('腾讯云核验凭据未配置（secretId/secretKey）', false)
    }

    const FaceidClient = faceid.v20180301.Client
    const client = new FaceidClient({
      credential: { secretId, secretKey },
      region: realnameConfigString(input.config, 'region') || DEFAULT_REGION,
      profile: {
        httpProfile: { endpoint: realnameConfigString(input.config, 'endpoint') || DEFAULT_ENDPOINT },
      },
    })

    let response
    try {
      response = await client.IdCardVerification({
        Name: input.realName,
        IdCard: input.citizenId,
      })
    } catch (error) {
      throw new RealnameVerifyError(
        `腾讯云核验请求异常：${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }

    const code = response.Result
    switch (code) {
      case '0':
        return { outcome: 'match', rawCode: code, message: response.Description ?? undefined }
      case '-1':
      case '-2':
      case '-3':
        return { outcome: 'mismatch', rawCode: code, message: response.Description ?? undefined }
      case '-5':
        return { outcome: 'no_record', rawCode: code, message: response.Description ?? undefined }
      default:
        throw new RealnameVerifyError(
          `腾讯云核验失败：${response.Description ?? code ?? '未知错误'}`,
          true,
        )
    }
  }
}
