// 核对已有实页证据，不把截图文件存在当作真实支付验收。
import assert from 'node:assert/strict'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const miniDir = resolve(root, 'apps/api/.tmp/agency-fees-mini-20261031')
const webDir = resolve(root, 'apps/api/.tmp/agency-fees-visual-20261031')
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
const mini = await readJson(resolve(miniDir, 'mini-report.json'))
const browser = await readJson(resolve(webDir, 'browser-report.json'))
const assertions = []
let screenshotCount = 0
async function screenshot(directory, name) {
  const file = await stat(resolve(directory, name))
  assert.ok(file.size > 1000, `截图为空或过小：${name}`)
  screenshotCount++
}
const services = ['registration', 'finance-tax', 'business-change', 'license']
assert.equal(mini.channel, 'not invoked')
assert.equal(mini.checks.length, 12)
const seen = new Set()
for (const row of mini.checks) {
  const key = `${row.service}/${row.mode}`
  assert.ok(services.includes(row.service) && ['free', 'fixed', 'manual'].includes(row.mode))
  assert.ok(!seen.has(key), `重复矩阵项：${key}`)
  seen.add(key)
  if (row.mode === 'free') { assert.equal(row.status, 'free'); assert.equal(row.amount, 0) }
  if (row.mode === 'fixed') { assert.equal(row.status, 'quoted'); assert.ok(Number.isSafeInteger(row.amount) && row.amount > 0) }
  if (row.mode === 'manual') { assert.equal(row.status, 'pending_acceptance'); assert.equal(row.amount, null) }
  assert.ok(row.id && Number.isFinite(row.scrollHeight) && row.scrollHeight > 0)
  for (let top = 0; top < row.scrollHeight; top += 620) await screenshot(miniDir, `${row.service}-${row.mode}-${top}.jpg`)
}
assertions.push('小程序四业务×三模式12项齐全且无重复', '免费/确认报价/未受理金额语义正确', '长页按620px分段的全部截图存在且非空')
assert.equal(browser.channel, 'mock only')
assert.deepEqual(browser.errors, [])
for (const service of services) {
  for (const mode of ['free', 'fixed', 'manual']) {
    assert.ok(browser.checks.includes(`web ${service}/${mode}`))
    await screenshot(webDir, `web-${service}-${mode}-full.png`)
  }
  assert.ok(browser.checks.includes(`manual accept ${service}`))
  await screenshot(webDir, `admin-${service}-quote-full.png`)
}
assert.ok(browser.checks.includes('stale quote rejected; new amount requires reconfirmation'))
assert.ok(browser.checks.includes('320px overflow and system dark mode captured'))
await screenshot(webDir, 'web-reprice-history-full.png')
await screenshot(webDir, 'web-narrow-fee-full.png')
await screenshot(webDir, 'web-dark-fee-full.png')
assertions.push('浏览器四业务详情及人工受理证据齐全，无页面脚本异常', '旧报价拒绝、重新确认、320px与暗色检查均有记录')

const supplement = await readJson(resolve(miniDir, 'supplement-report.json'))
assert.equal(supplement.channel, 'not invoked')
assert.equal(supplement.checks.length, 1)
const fixed = supplement.checks[0]
assert.equal(fixed.service, 'registration'); assert.equal(fixed.mode, 'fixed')
assert.equal(fixed.status, 'quoted'); assert.equal(fixed.amount, 19900)
await screenshot(miniDir, 'dark-fee-supplement.jpg')
assertions.push('小程序固定报价补验通过，暗色截图已回到页首覆盖费用卡')
const revisions = Object.fromEntries(['api', 'admin', 'client-mobile', 'wxminiprogram'].map(repo => [repo, execFileSync('git', ['-C', resolve(root, 'apps', repo), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()]))
const output = resolve(miniDir, 'report.json')
await writeFile(output, JSON.stringify({
  status: 'passed', verifiedAt: new Date().toISOString(), verificationRevisions: revisions,
  evidenceNote: '12页矩阵来自既有走查；补充暗色实页为本轮运行。当前提交号仅表示核对时版本，非历史截图拍摄版本。',
  miniDetails: mini.checks.length, browserChecks: browser.checks.length, screenshotCount, assertions,
  paymentChannel: 'mock only; no real payment invoked', realDeviceAccepted: false, productionReleaseAccepted: false,
  sources: ['mini-report.json', 'supplement-report.json', '../agency-fees-visual-20261031/browser-report.json'],
}, null, 2) + '\n')
console.log(`验收证据断言通过：12个小程序详情、${browser.checks.length}项浏览器检查、${screenshotCount}份截图；${output}`)
