async page => {
  const out = {}
  const likePromise = page.waitForResponse(r => r.url().includes('/likes/toggle'))
  await page.getByRole('button', { name: /点赞/ }).click()
  const likeResp = await likePromise
  out.like = { status: likeResp.status(), body: (await likeResp.text()).slice(0, 100) }
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '社区个体 · 陈屿' }).click()
  await page.getByPlaceholder('友善评论，共建社区…').fill('联调测试：文章内容清晰，期待更多案例。')
  const commentPromise = page.waitForResponse(r => r.url().includes('/comments'))
  await page.getByRole('button', { name: '发表评论' }).click()
  try {
    const resp = await commentPromise
    out.comment = { status: resp.status(), body: (await resp.text()).slice(0, 140), request: resp.request().postData()?.slice(0, 160) }
  } catch (e) {
    out.comment = { error: String(e).slice(0, 60) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-200)
  return JSON.stringify(out)
}
