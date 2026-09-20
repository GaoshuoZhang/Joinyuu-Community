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
      return j.data?.token ?? ''
    }
    const out = {}
    const t6 = await login('13801210006')
    const h6 = { Authorization: 'Bearer ' + t6, 'Content-Type': 'application/json' }
    const send = await fetch('/api/app/me/enterprises/E2001/transfer-contact', { method: 'POST', headers: h6, body: JSON.stringify({ memberUid: 'U1001', memberName: '陈屿' }) })
    out.sendBack = { status: send.status, body: (await send.text()).slice(0, 100) }
    const t1 = await login('13801210001')
    const h1 = { Authorization: 'Bearer ' + t1, 'Content-Type': 'application/json' }
    const list = await fetch('/api/app/me/transfer-requests', { headers: h1 })
    const lj = await list.json()
    const pending = (lj.data ?? []).find(x => x.status === 'pending')
    out.pendingForU1001 = pending ? { id: pending.id, fromName: pending.fromName } : null
    const accept = await fetch('/api/app/me/transfer-requests/' + pending?.id + '/respond', { method: 'POST', headers: h1, body: JSON.stringify({ action: 'accept' }) })
    out.acceptBack = { status: accept.status, body: (await accept.text()).slice(0, 100) }
    const e = await fetch('/api/app/me/enterprises/E2001', { headers: h1 })
    const ej = await e.json()
    out.u1001After = { isContact: ej.data?.isContact, contactName: ej.data?.contactName }
    return out
  })
}
