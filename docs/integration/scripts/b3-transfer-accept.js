async page => {
  return await page.evaluate(async () => {
    async function login(phone) {
      const c = await fetch('/api/app/auth/captcha')
      const cj = await c.json()
      const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
      const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
      const r = await fetch('/api/app/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: 'user123', captchaId: cj.data.captchaId, captchaCode: code }),
      })
      const j = await r.json()
      return { token: j.data?.token ?? '', uid: j.data?.uid, status: r.status }
    }
    const out = {}
    const u1006 = await login('13801210006')
    const h6 = { Authorization: 'Bearer ' + u1006.token, 'Content-Type': 'application/json' }
    const list = await fetch('/api/app/me/transfer-requests', { headers: h6 })
    const lj = await list.json()
    const pending = (lj.data ?? []).find(x => x.status === 'pending')
    out.pending = pending ? { id: pending.id, fromName: pending.fromName } : null
    const accept = await fetch('/api/app/me/transfer-requests/' + pending?.id + '/respond', { method: 'POST', headers: h6, body: JSON.stringify({ action: 'accept' }) })
    out.accept = { status: accept.status, body: (await accept.text()).slice(0, 100) }
    const e6 = await fetch('/api/app/me/enterprises/E2001', { headers: h6 })
    const ej6 = await e6.json()
    out.u1006After = { isContact: ej6.data?.isContact, role: (ej6.data?.members ?? []).find(m => m.uid === 'U1006')?.isContact }
    const login1 = await login('13801210001')
    const h1 = { Authorization: 'Bearer ' + login1.token }
    const me1 = await fetch('/api/app/me', { headers: h1 })
    const mj1 = await me1.json()
    out.u1001Identity = (mj1.data?.identities ?? []).filter(x => x.type === 'community_enterprise').map(x => ({ enterpriseId: x.enterpriseId, role: x.role }))
    out.u1001Token = login1.token
    out.u1006Token = u1006.token
    return out
  })
}
