// 条件组合视觉验收（P2-9 任务2）：三服务复杂条件组合表单填满态长页截图。
// 覆盖：年报双事项多选、法人双面证件、股权多人转让、董监高/其他说明、ICP 专项、
// 历史报表交接、成立日期/行业/员工数选填、长公司名。只截图+断言条件块显隐，不提交。
// 复用既有隔离端口：fixture 17757 / Web 17759。截图输出到
// apps/admin/test/artifacts/enterprise-combos-20261031/。
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

assert.ok(process.env.PLAYWRIGHT_PACKAGE, '请指定已安装Playwright的package.json')
assert.ok(process.env.AGENCY_E2E_FIXTURE, '请指定隔离fixture私有文件')
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const fixture = JSON.parse(await readFile(process.env.AGENCY_E2E_FIXTURE, 'utf8'))
const root = resolve(import.meta.dirname, '../..')
const out = process.env.AGENCY_E2E_OUT || resolve(root, 'apps/admin/test/artifacts/enterprise-combos-20261031')
await mkdir(out, { recursive: true })
const mobileBase = 'http://127.0.0.1:17759'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const errors = []
const records = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(15000)
await context.addInitScript(token => localStorage.setItem('joinyuu_client_token', token), fixture.owner)

const field = key => page.locator(`[data-field-key="${key}"]`)
const fill = (key, text) => field(key).locator('input,textarea').first().fill(text)
async function visit(path) {
  await page.goto(mobileBase + path)
  await page.waitForLoadState('networkidle')
}
async function screenshots(name) {
  await page.screenshot({ path: resolve(out, `${name}-full.png`), fullPage: true })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let top = 0, index = 0; top < height; top += 700, index++) {
    await page.evaluate(y => window.scrollTo(0, y), top)
    await page.screenshot({ path: resolve(out, `${name}-scroll-${index}.png`) })
  }
  return height
}
const syntheticPdf = { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% combo visual acceptance\n%%EOF') }
const syntheticPng = { name: 'synthetic-id.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }

try {
  /* ---------- 财税：年报汇算双事项 + 交接历史报表 + 全部选填 ---------- */
  await visit('/me/enterprise-services/finance-tax')
  await field('company.name').waitFor()
  await fill('company.name', '聚屿条件组合验收之财税服务专用超长企业名称测试用例')
  await fill('company.creditCode', '91310000MA1K000003')
  await field('purpose').getByText('年报与汇算清缴', { exact: true }).click()
  await field('fiscalYear').waitFor()
  await fill('fiscalYear', '2025')
  await field('annualItems').getByText('工商年报', { exact: true }).click()
  await field('annualItems').getByText('所得税汇算清缴', { exact: true }).click()
  assert.ok(await field('annualItems').getByText('工商年报', { exact: true }).isVisible())
  assert.ok(await field('annualItems').getByText('所得税汇算清缴', { exact: true }).isVisible())
  assert.equal(await field('startMonth').count(), 0, '年报目的下不显示记账起始月')
  await field('taxType').getByText('一般纳税人', { exact: true }).click()
  await field('monthlyVoucherBand').getByText('每月 60 张以上', { exact: true }).click()
  await field('socialInsurance').getByText('有', { exact: true }).click()
  await field('housingFund').getByText('不清楚', { exact: true }).click()
  await field('previousAgent').getByText('有，需要交接', { exact: true }).click()
  await field('historicalReports').waitFor()
  await fill('foundedOn', '2019-08-15')
  await fill('industry', '信息技术与软件开发')
  await fill('employeeCount', '45')
  await fill('contact.name', '组合验收联系人')
  await fill('contact.phone', '13800000003')
  await field('licenseCopy').locator('input[type=file]').setInputFiles(syntheticPdf)
  await field('historicalReports').locator('input[type=file]').setInputFiles(syntheticPdf)
  await fill('remark', '条件组合验收补充说明：年报双事项、需要历史报表交接、含全部选填字段。')
  await field('consent').getByRole('checkbox').click()
  const taxHeight = await screenshots('combo-tax-annual')
  assert.ok(taxHeight > 2000, `财税组合表单应超两屏，实际 ${taxHeight}px`)
  records.push({ service: 'finance-tax', combo: 'annual_filing+handover+optionals', fullPageHeight: taxHeight })

  /* ---------- 工商变更：法人+地址+股权（3行转让）+董监高+其他+名称 多类型并存 ---------- */
  await visit('/me/enterprise-services/business-change')
  await field('company.name').waitFor()
  await fill('company.name', '聚屿组合验收变更企业')
  await fill('company.creditCode', '91310000MA1K000004')
  for (const type of ['名称变更', '法定代表人变更', '地址变更', '注册资本变更', '股权变更', '董监高备案', '其他']) {
    await field('changeTypes').getByText(type, { exact: true }).click()
  }
  await fill('name.originalName', '聚屿组合验收变更企业')
  await fill('name.newName', '聚屿组合验收变更企业（新名称）')
  await fill('name.altName1', '组合验收备选名称一')
  await fill('name.altName2', '组合验收备选名称二')
  await fill('legalRep.newName', '组合新法人')
  await fill('legalRep.newIdNumber', '110101199003071233')
  await fill('legalRep.newPhone', '13800000004')
  await field('legalRep.idFront').locator('input[type=file]').setInputFiles(syntheticPng)
  await field('legalRep.idBack').locator('input[type=file]').setInputFiles(syntheticPng)
  await fill('address.newAddress', '隔离市测试区组合验收路 88 号 5 层 501 室')
  await field('address.inCommunity').getByText('非本社区地址', { exact: true }).click()
  await fill('capital.originalWan', '800')
  await fill('capital.newWan', '1200')
  await field('capital.direction').getByText('增资', { exact: true }).click()
  for (let row = 0; row < 2; row++) {
    await page.getByRole('button', { name: '添加转让记录', exact: true }).click()
  }
  const transfers = page.locator('.transfer-card')
  assert.equal(await transfers.count(), 3, '应有 3 行股权转让')
  const transferData = [
    { transferor: '组合转让方甲', transferee: '组合受让方乙', ratio: '40' },
    { transferor: '组合转让方丙', transferee: '组合受让方丁', ratio: '35' },
    { transferor: '组合转让方戊', transferee: '组合受让方己', ratio: '25' },
  ]
  for (const [index, item] of transferData.entries()) {
    const card = transfers.nth(index)
    await card.locator('[data-field-key="equity.transfers.transferorName"] input').fill(item.transferor)
    await card.locator('[data-field-key="equity.transfers.transfereeName"] input').fill(item.transferee)
    await card.locator('[data-field-key="equity.transfers.ratio"] input').fill(item.ratio)
  }
  await fill('supervisors.note', '组合验收董监高备案说明：更换一名监事并备案。')
  await fill('other.note', '组合验收其他事项说明：同步更新章程备案信息。')
  await fill('contact.name', '组合验收联系人')
  await fill('contact.phone', '13800000003')
  await field('licenseCopy').locator('input[type=file]').setInputFiles(syntheticPdf)
  await field('consent').getByRole('checkbox').click()
  const changeHeight = await screenshots('combo-change-multi')
  assert.ok(changeHeight > 4000, `多类型变更表单应超四屏，实际 ${changeHeight}px`)
  records.push({ service: 'business-change', combo: '7types+3transfers+altNames', fullPageHeight: changeHeight })

  /* ---------- 资质：ICP 专项（含主办主体切换）+ hr 场景对照 ---------- */
  await visit('/me/enterprise-services/license')
  await field('company.name').waitFor()
  await fill('company.name', '聚屿组合验收资质企业')
  await fill('company.creditCode', '91310000MA1K000005')
  await fill('region', '隔离市测试区高新园区')
  await field('licenseType').getByText('ICP 备案协助', { exact: true }).click()
  await field('websiteName').waitFor()
  assert.equal(await field('principalName').count(), 0, 'ICP 下不显示食品负责人字段')
  await field('ownerType').getByText('企业', { exact: true }).click()
  await fill('websiteName', '组合验收网站')
  await fill('domain', 'combo-acceptance.example.com')
  await fill('hostProvider', '隔离云接入服务商')
  await fill('contact.name', '组合验收联系人')
  await fill('contact.phone', '13800000003')
  await field('licenseCopy').locator('input[type=file]').setInputFiles(syntheticPdf)
  const icpHeight = await screenshots('combo-license-icp')
  // 切换到 hr 验证专项字段显隐与 3 人名单
  await field('licenseType').getByText('人力资源服务许可', { exact: true }).click()
  await field('fixedPremisesNote').waitFor()
  assert.equal(await field('websiteName').count(), 0, 'hr 下不显示 ICP 网站字段')
  await fill('fixedPremisesNote', '组合验收固定场所与设施说明：80 平米办公场所及相应设施。')
  for (let index = 0; index < 3; index++) {
    await field('staff').locator('input').nth(index).fill(`组合专职人员${index + 1}`)
  }
  await field('consent').getByRole('checkbox').click()
  const hrHeight = await screenshots('combo-license-hr')
  records.push({ service: 'license', combo: 'icp-then-hr-switch', icpHeight, hrHeight })

  assert.deepEqual(errors, [])
  await writeFile(resolve(out, 'combo-report.json'), JSON.stringify({ records, errors }, null, 2))
  console.log('PASS combos:', JSON.stringify(records))
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  errors.push(error.message)
  await writeFile(resolve(out, 'combo-report.json'), JSON.stringify({ records, errors }, null, 2))
  console.error('FAIL:', error.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
