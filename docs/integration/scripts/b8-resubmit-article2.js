async page => {
  const out = {}
  await page.locator('textarea[placeholder="写下这一段内容…"]').first().fill('这是一篇联调测试投稿，用于验证投稿全链路：提交 → 驳回并给出原因 → 修改重提 → 审核通过并发布 → 移动端广场可见。')
  await page.waitForTimeout(600)
  const submit = page.getByRole('button', { name: '重新提交' })
  out.hasSubmit = await submit.count()
  out.footer = (await page.locator('body').innerText()).slice(-120)
  if (out.hasSubmit) {
    const respPromise = page.waitForResponse(r => r.url().includes('/resubmit'))
    await submit.click()
    try {
      const resp = await respPromise
      out.resubmit = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 100), request: resp.request().postData()?.slice(0, 200) }
    } catch (e) {
      out.resubmit = { error: String(e).slice(0, 60) }
    }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-140)
  return JSON.stringify(out)
}
