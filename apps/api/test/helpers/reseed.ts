/* e2e 套件隔离：beforeAll 重跑全量种子（幂等：清空重建）
 * 写状态机的套件必须从干净种子出发，否则跨运行/跨套件污染 */
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assertSafeTestEnvironment } from '../../src/common/testing/test-environment'

export function reseed(): void {
  assertSafeTestEnvironment()
  execSync('npx tsx prisma/seed.ts', {
    cwd: join(__dirname, '..', '..'),
    stdio: 'pipe',
    env: { ...process.env, E2E_SEED_RESET_RATES: '1' },
  })
  // Real signed fixture; isolated test runs must not rely on a production license or bypass flag.
  process.env.E2E_LICENSE_PUBLIC_KEYS_FILE = join(tmpdir(), `joinyuu-license-test-${process.pid}.json`)
  execSync('npx tsx test/helpers/seed-license.ts', {
    cwd: join(__dirname, '..', '..'), stdio: 'pipe', env: process.env,
  })
}
