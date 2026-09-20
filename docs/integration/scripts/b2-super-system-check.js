async page => {
  const out = { pages: {}, api: {} }
  const routes = ['#/logs/login', '#/logs/audit', '#/system/monitor', '#/system/assets', '#/system/trash']
  for (const route of routes) {
    await page.goto('http://localhost:7758/' + route)
    await page.waitForTimeout(1100)
    const main = await page.locator('main').innerText()
    out.pages[route] = { url: page.url(), head: main.slice(0, 90).replace(/\n/g, ' / ') }
  }
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const exp = await fetch('/api/admin/export/users?page=1&pageSize=5', { headers: h })
    const expText = await exp.text()
    result.exportUsers = {
      status: exp.status,
      contentType: exp.headers.get('content-type'),
      disposition: exp.headers.get('content-disposition'),
      hasBom: expText.charCodeAt(0) === 0xfeff,
      head: expText.slice(1, 90).replace(/\n/g, ' '),
    }
    const print = await fetch('/api/admin/applications/AP3018/print', { headers: h })
    result.printApproval = { status: print.status, body: (await print.text()).slice(0, 140) }
    return result
  })
  return JSON.stringify(out)
}
