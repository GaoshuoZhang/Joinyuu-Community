async page => {
  const out = {}
  await page.waitForTimeout(800)
  out.nav = (await page.locator('nav, aside').first().innerText()).split('\n').map(s => s.trim()).filter(Boolean)
  out.localPerms = await page.evaluate(() => localStorage.getItem('joinyuu_admin_perm_codes'))
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const probe = async (name, url) => {
      const r = await fetch(url, { headers: h })
      result[name] = { status: r.status, body: (await r.text()).slice(0, 100) }
    }
    await probe('users', '/api/admin/users?page=1&pageSize=3')
    await probe('enterprises', '/api/admin/enterprises?page=1&pageSize=3')
    await probe('demandsReview', '/api/admin/demands?status=pending&page=1&pageSize=3')
    await probe('applications', '/api/admin/applications?page=1&pageSize=3')
    await probe('spaceReservations', '/api/admin/space-reservations?page=1&pageSize=3')
    await probe('auditLogs', '/api/admin/audit-logs?page=1&pageSize=3')
    await probe('dicts', '/api/admin/dicts/demand_category')
    return result
  })
  await page.goto('http://localhost:7758/#/users')
  await page.waitForTimeout(1200)
  out.routeUsers = { url: page.url(), main: (await page.locator('main').innerText()).slice(0, 160) }
  return JSON.stringify(out)
}
