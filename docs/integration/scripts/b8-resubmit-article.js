async page => {
  const out = {}
  await page.getByRole('button', { name: '修改重提' }).first().click()
  await page.waitForTimeout(1800)
  out.url = page.url()
  out.tail = (await page.locator('body').innerText()).slice(-260)
  const submit = page.getByRole('button', { name: '重新提交' })
  out.hasSubmit = await submit.count()
  if (out.hasSubmit) {
    const respPromise = page.waitForResponse(r => r.url().includes('/resubmit'))
    await submit.click()
    try {
      const resp = await respPromise
      out.resubmit = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 100) }
    } catch (e) {
      out.resubmit = { error: String(e).slice(0, 60) }
    }
  }
  await page.waitForTimeout(1200)
  out.afterTail = (await page.locator('body').innerText()).slice(-160)
  return JSON.stringify(out)
}
