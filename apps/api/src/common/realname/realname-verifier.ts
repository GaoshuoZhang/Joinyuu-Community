/* 实名核验（权威二要素：姓名 + 身份证号）驱动契约（P1）。
 * 供应商：阿里云实人认证（cloudauth Id2MetaVerify）/ 腾讯云人脸核身（faceid IdCardVerification）。
 * 凭据只从环境变量读取（credentialEnv 仅存变量名），响应与审计都不含密钥原文。 */

export type RealnameProvider = 'aliyun' | 'tencent'

/** 核验结论：一致 / 不一致 / 无此记录 */
export type RealnameOutcome = 'match' | 'mismatch' | 'no_record'

export interface RealnameCredentialField {
  key: string
  label: string
  required?: boolean
}

export interface RealnameConfigField {
  key: string
  label: string
  required?: boolean
  hint?: string
}

export interface RealnameVerifierMeta {
  provider: RealnameProvider
  label: string
  /** 非机密配置字段（endpoint/region 等） */
  configFields: readonly RealnameConfigField[]
  /** 需在环境变量中提供的凭据变量名（仅校验齐备性，不回传值） */
  credentialKeys: readonly RealnameCredentialField[]
}

export interface RealnameVerifyInput {
  realName: string
  citizenId: string
  config: Record<string, unknown>
  credentials: Record<string, string>
}

export interface RealnameVerifyResult {
  outcome: RealnameOutcome
  /** 供应商原始结果码（不含个人信息，便于排障） */
  rawCode?: string
  message?: string
}

export interface RealnameVerifier {
  readonly provider: RealnameProvider
  verify(input: RealnameVerifyInput): Promise<RealnameVerifyResult>
}

/** 核验调用失败（网络/鉴权/样例非法等）；retriable 表示可重试 */
export class RealnameVerifyError extends Error {
  readonly retriable: boolean

  constructor(message: string, retriable = true) {
    super(message)
    this.name = 'RealnameVerifyError'
    this.retriable = retriable
  }
}

export const REALNAME_PROVIDERS: readonly RealnameProvider[] = ['aliyun', 'tencent']

export const REALNAME_PROVIDER_META: readonly RealnameVerifierMeta[] = [
  {
    provider: 'aliyun',
    label: '阿里云实人认证（Id2MetaVerify）',
    configFields: [
      {
        key: 'endpoint',
        label: 'Endpoint',
        hint: '区域化服务，缺省 cloudauth.cn-beijing.aliyuncs.com（亦可 cn-hangzhou 等）',
      },
    ],
    credentialKeys: [
      { key: 'accessKeyId', label: 'AccessKeyId', required: true },
      { key: 'accessKeySecret', label: 'AccessKeySecret', required: true },
    ],
  },
  {
    provider: 'tencent',
    label: '腾讯云人脸核身（IdCardVerification）',
    configFields: [
      { key: 'region', label: 'Region', hint: '缺省 ap-guangzhou' },
      { key: 'endpoint', label: 'Endpoint', hint: '缺省 faceid.tencentcloudapi.com' },
    ],
    credentialKeys: [
      { key: 'secretId', label: 'SecretId', required: true },
      { key: 'secretKey', label: 'SecretKey', required: true },
    ],
  },
]

export function realnameProviderMeta(provider: string): RealnameVerifierMeta | undefined {
  return REALNAME_PROVIDER_META.find((item) => item.provider === provider)
}

export function isRealnameProvider(value: string): value is RealnameProvider {
  return (REALNAME_PROVIDERS as readonly string[]).includes(value)
}

/** 从非机密配置取字符串项（缺省空串） */
export function realnameConfigString(config: Record<string, unknown>, key: string): string {
  const value = config[key]
  return value == null ? '' : String(value).trim()
}

/** 仅用于「测试联通」的固定样例姓名 */
export const REALNAME_TEST_SAMPLE_NAME = '张三'

/** 生成格式合法（GB 11643 校验位正确）的样例身份证号，避免因格式非法掩盖连通性判断 */
export function sampleCitizenId(prefix17 = '11010119900307421'): string {
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  const base = prefix17.slice(0, 17).padEnd(17, '0')
  let sum = 0
  for (let i = 0; i < 17; i += 1) sum += Number(base[i]) * weights[i]
  return `${base}${codes[sum % 11]}`
}
