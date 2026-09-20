async page => {
  const out = {}
  await page.getByPlaceholder('退回原因（必填）…').fill('联调测试：请补充立项纪要附件后重新提交。')
  const respPromise = page.waitForResponse(r => r.url().includes('/return'))
  await page.getByRole('button', { name: '确认退回' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 140), request: resp.request().postData()?.slice(0, 160) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-180)
  return JSON.stringify(out)
}
