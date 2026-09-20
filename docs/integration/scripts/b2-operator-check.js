async page => {
  const out = {}
  await page.waitForTimeout(800)
  out.nav = (await page.locator('nav, aside').first().innerText()).split('\n').map(s => s.trim()).filter(Boolean)
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const probe = async (name, url) => {
      const r = await fetch(url, { headers: h })
      result[name] = { status: r.status, body: (await r.text()).slice(0, 70) }
    }
    await probe('users', '/api/admin/users?page=1&pageSize=3')
    await probe('demands', '/api/admin/demands?page=1&pageSize=3')
    await probe('mallGoods', '/api/admin/mall/goods?page=1&pageSize=3')
    await probe('dicts', '/api/admin/dicts/demand_category')
    await probe('experienceRules', '/api/admin/rules/experience')
    await probe('workstations', '/api/admin/workstations')
    await probe('contents', '/api/admin/contents/articles?page=1&pageSize=3')
    await probe('policies', '/api/admin/policies?page=1&pageSize=3')
    return result
  })
  const routes = ['#/demands', '#/users', '#/system/dicts', '#/mall/goods', '#/rules/experience']
  out.routes = {}
  for (const route of routes) {
    await page.goto('http://localhost:7758/' + route)
    await page.waitForTimeout(900)
    const main = await page.locator('main').innerText()
    out.routes[route] = { url: page.url(), head: main.slice(0, 60).replace(/\n/g, ' / ') }
  }
  return JSON.stringify(out)
}
