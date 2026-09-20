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
      result[name] = { status: r.status, body: (await r.text()).slice(0, 90) }
    }
    await probe('demands', '/api/admin/demands?page=1&pageSize=3')
    await probe('users', '/api/admin/users?page=1&pageSize=3')
    await probe('contents', '/api/admin/contents/articles?page=1&pageSize=3')
    return result
  })
  await page.goto('http://localhost:7758/#/demands')
  await page.waitForTimeout(1200)
  out.demandsRoute = { url: page.url(), main: (await page.locator('main').innerText()).slice(0, 140).replace(/\n/g, ' / ') }
  await page.goto('http://localhost:7758/#/users')
  await page.waitForTimeout(1000)
  out.usersRoute = { url: page.url(), main: (await page.locator('main').innerText()).slice(0, 100).replace(/\n/g, ' / ') }
  return JSON.stringify(out)
}
