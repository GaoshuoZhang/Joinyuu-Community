async page => {
  const out = {}
  const inputs = page.locator('input:visible')
  const textareas = page.locator('textarea:visible')
  await inputs.nth(0).fill('联调测试：AI 质检 SaaS 天使轮融资')
  await textareas.nth(0).fill('面向制造业的 AI 视觉质检 SaaS，已完成 POC，服务 6 家工厂。')
  await textareas.nth(1).fill('天使轮融资 300 万，寻找产业资源型投资人与渠道合作。')
  await textareas.nth(2).fill('工业客户渠道、质量数据合作、AI 工程人才推荐。')
  await inputs.nth(1).fill('陈屿')
  await inputs.nth(2).fill('13801210001')
  await page.getByText('企业服务 SaaS', { exact: true }).click()
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
