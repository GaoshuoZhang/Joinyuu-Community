async page => {
  return await page.evaluate(async () => {
    const out = {}
    const r1 = await fetch('/api/app/demands/D999999')
    out.notFound = { status: r1.status, body: await r1.text() }
    const r2 = await fetch('/api/admin/users?page=0&pageSize=3')
    out.badPage = { status: r2.status, body: await r2.text() }
    const r3 = await fetch('/api/admin/demands?status=bogus')
    out.badStatus = { status: r3.status, body: (await r3.text()).slice(0, 200) }
    const r4 = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    })
    out.badJson = { status: r4.status, body: await r4.text() }
    const r5 = await fetch('/api/admin/users?pageSize=99999')
    out.hugePageSize = { status: r5.status, body: (await r5.text()).slice(0, 200) }
    return JSON.stringify(out)
  })
}
