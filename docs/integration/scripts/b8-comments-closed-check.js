async page => {
  const out = {}
  await page.goto('http://localhost:7759/articles/A1012')
  await page.waitForTimeout(1800)
  out.pageTail = (await page.locator('body').innerText()).slice(-220)
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const r = await fetch('/api/app/articles/A1012/comments', { method: 'POST', headers: h, body: JSON.stringify({ content: '关闭评论后发表应被拒绝', asIdentity: 'community_individual' }) })
    return { postComment: { status: r.status, body: (await r.text()).slice(0, 120) } }
  })
  return JSON.stringify(out)
}
