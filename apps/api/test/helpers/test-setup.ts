/* e2e 全局准备：关闭 Node 全局 HTTP agent 的 keep-alive。
 * Docker Desktop/负载下服务端或代理会回收空闲连接，跨用例复用旧 socket 会随机 ECONNRESET；
 * 测试请求一律新建连接，避免此类抖动（仅影响测试进程）。 */
import http from 'node:http'

// Only Jest substitutes test trust roots. The shipped backend never reads an environment key file.
jest.mock('../../src/common/license/trusted-keys', () => ({
  getTrustedLicenseKeys: () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs')
    const { assertSafeTestEnvironment } = jest.requireActual<typeof import('../../src/common/testing/test-environment')>('../../src/common/testing/test-environment')
    assertSafeTestEnvironment()
    const path = process.env.E2E_LICENSE_PUBLIC_KEYS_FILE
    if (!path?.includes('joinyuu-license-test-')) throw new Error('缺少隔离测试公钥')
    return JSON.parse(readFileSync(path, 'utf8'))
  },
}))

;(http.globalAgent as http.Agent & { keepAlive: boolean }).keepAlive = false
