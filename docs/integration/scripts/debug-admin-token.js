async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    let payload = null
    try {
      payload = JSON.parse(atob(t.split('.')[1]))
    } catch (e) {
      payload = { decodeError: String(e) }
    }
    const r = await fetch('/api/admin/users?page=1&pageSize=3', { headers: { Authorization: 'Bearer ' + t } })
    return JSON.stringify({
      tokenLen: t.length,
      tokenPrefix: t.slice(0, 24),
      scope: payload?.scope,
      jti: payload?.jti,
      sub: payload?.sub,
      exp: payload?.exp,
      now: Math.floor(Date.now() / 1000),
      status: r.status,
      body: (await r.text()).slice(0, 120),
    })
  })
}
