async page => {
  const out = {}
  const inputs = page.locator('input:visible')
  const textareas = page.locator('textarea:visible')
  await inputs.nth(0).fill('联调测试：寻找智能制造渠道合作伙伴')
  await textareas.nth(0).fill('AI 质检 SaaS 已服务 6 家工厂，希望拓展长三角制造业渠道。')
  await page.getByText('市场', { exact: true }).click()
  await textareas.nth(1).fill('缺少区域渠道与集成商资源，希望寻找有制造业客户资源的伙伴联合拓展。')
  await inputs.nth(1).fill('项目制合作、渠道分成')
  await textareas.nth(2).fill('提供产品培训、交付支持与 30% 渠道分成。')
  await inputs.nth(2).fill('陈屿')
  await inputs.nth(3).fill('13801210001')
  await page.getByRole('button', { name: '社区个体 · 陈屿' }).click()
  const respPromise = page.waitForResponse(r => r.url().includes('/api/app/demands'))
  await page.getByRole('button', { name: '提交需求' }).click()
  try {
    const resp = await respPromise
    out.result = { status: resp.status(), body: (await resp.text()).slice(0, 140), request: resp.request().postData()?.slice(0, 260) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80), tail: (await page.locator('body').innerText()).slice(-160) }
  }
  await page.waitForTimeout(1000)
  return JSON.stringify(out)
}
