async page => {
  const out = {}
  await page.getByPlaceholder('交付说明（选填）…').fill('联调测试：项目立项材料已确认，进入执行阶段。')
  const fileInput = page.locator('input[type="file"]')
  if (await fileInput.count()) {
    await fileInput.first().setInputFiles('D:/Projects/Joinyuu-Community/docs/integration/assets/avatar-ok.png')
    await page.waitForTimeout(1500)
    out.uploaded = true
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/milestones/'))
  await page.getByRole('button', { name: '确认提交' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 160), request: resp.request().postData()?.slice(0, 240) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80), tail: (await page.locator('body').innerText()).slice(-160) }
  }
  await page.waitForTimeout(1200)
  return JSON.stringify(out)
}
