async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const out = {}
    const r2 = await fetch('/api/admin/users?page=0&pageSize=3', { headers: h })
    out.badPage = { status: r2.status, body: await r2.text() }
    const r3 = await fetch('/api/admin/demands?status=bogus', { headers: h })
    out.badStatus = { status: r3.status, body: (await r3.text()).slice(0, 200) }
    const r4 = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    })
    out.badJson = { status: r4.status, body: await r4.text() }
    const r5 = await fetch('/api/admin/users?pageSize=99999', { headers: h })
    out.hugePageSize = { status: r5.status, body: (await r5.text()).slice(0, 200) }
    return JSON.stringify(out)
  })
}
