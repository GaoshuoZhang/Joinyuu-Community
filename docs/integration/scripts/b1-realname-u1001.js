async page => {
  const result = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const g = await fetch('/api/app/me/realname', { headers: h })
    out.status = { code: g.status, body: await g.text() }
    const p = await fetch('/api/app/me/realname', {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({ realName: '陈屿', citizenId: '1101011990011003711X' }),
    })
    out.reverify = { code: p.status, body: await p.text() }
    const r = await fetch('/api/app/me/realname-rights', { headers: h })
    out.rights = { code: r.status, body: (await r.text()).slice(0, 400) }
    return out
  })
  return JSON.stringify(result)
}
