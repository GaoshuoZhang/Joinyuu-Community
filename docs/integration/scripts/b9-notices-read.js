async page => {
  const out = {}
  await page.goto('http://localhost:7759/notices')
  await page.waitForTimeout(1800)
  out.page = (await page.locator('body').innerText()).slice(0, 300)
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const before = await (await fetch('/api/app/notices/unread-count', { headers: h })).json()
    const list = await (await fetch('/api/app/notices?page=1&pageSize=5', { headers: h })).json()
    const first = (list.data?.list ?? [])[0]
    const r1 = first ? await fetch('/api/app/notices/' + first.id + '/read', { method: 'POST', headers: h }) : null
    const afterOne = await (await fetch('/api/app/notices/unread-count', { headers: h })).json()
    const rAll = await fetch('/api/app/notices/read-all', { method: 'POST', headers: h })
    const afterAll = await (await fetch('/api/app/notices/unread-count', { headers: h })).json()
    return {
      before: before.data,
      firstLink: first?.link ?? null,
      markOne: r1 ? { status: r1.status } : null,
      afterOne: afterOne.data,
      markAll: { status: rAll.status, body: (await rAll.text()).slice(0, 80) },
      afterAll: afterAll.data,
    }
  })
  return JSON.stringify(out)
}
