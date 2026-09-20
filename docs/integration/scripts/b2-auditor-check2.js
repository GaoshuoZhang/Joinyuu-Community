async page => {
  const out = {}
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const probe = async (name, url) => {
      const r = await fetch(url, { headers: h })
      result[name] = { status: r.status, body: (await r.text()).slice(0, 90) }
    }
    await probe('deletions', '/api/admin/member-governance/deletions?page=1&pageSize=5')
    await probe('userDetail', '/api/admin/users/U1001')
    await probe('export', '/api/admin/system/export/users')
    await probe('monitor', '/api/admin/monitor/summary')
    await probe('trash', '/api/admin/trash?page=1&pageSize=5')
    await probe('sessions', '/api/admin/system/sessions')
    return result
  })
  const routes = ['#/system/deletion-requests', '#/system/dicts', '#/system/admins', '#/governance', '#/logs/audit']
  out.routes = {}
  for (const route of routes) {
    await page.goto('http://localhost:7758/' + route)
    await page.waitForTimeout(1000)
    const main = await page.locator('main').innerText()
    out.routes[route] = { url: page.url(), head: main.slice(0, 70).replace(/\n/g, ' / ') }
  }
  return JSON.stringify(out)
}
