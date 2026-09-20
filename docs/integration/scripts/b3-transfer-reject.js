async page => {
  return await page.evaluate(async () => {
    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const login = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13801210006', password: 'user123', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    const lj = await login.json()
    const t = lj.data?.token ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = { login: { status: login.status, uid: lj.data?.uid } }
    const list = await fetch('/api/app/me/transfer-requests', { headers: h })
    const lj2 = await list.json()
    out.requests = (lj2.data ?? []).map(x => ({ id: x.id, enterpriseName: x.enterpriseName, status: x.status, fromName: x.fromName }))
    const req = (lj2.data ?? []).find(x => x.status === 'pending')
    if (req) {
      const respond = await fetch('/api/app/me/transfer-requests/' + req.id + '/respond', { method: 'POST', headers: h, body: JSON.stringify({ action: 'reject' }) })
      out.reject = { status: respond.status, body: (await respond.text()).slice(0, 100) }
    }
    const e = await fetch('/api/app/me/enterprises/E2001', { headers: h })
    const ej = await e.json()
    out.after = { isContact: ej.data?.isContact, contactName: ej.data?.contactName }
    return out
  })
}
