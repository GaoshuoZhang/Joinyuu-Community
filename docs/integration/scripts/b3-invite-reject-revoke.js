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
    const t1 = await login('13801210001')
    const h1 = { Authorization: 'Bearer ' + t1, 'Content-Type': 'application/json' }
    const inv1 = await fetch('/api/app/me/enterprises/E2001/invite', { method: 'POST', headers: h1, body: JSON.stringify({ name: '许新言', phone: '13801210015', role: '联调邀请' }) })
    out.invite1 = { status: inv1.status, body: (await inv1.text()).slice(0, 80) }
    const t15 = await login('13801210015')
    const h15 = { Authorization: 'Bearer ' + t15, 'Content-Type': 'application/json' }
    const notices = await fetch('/api/app/notices?page=1&pageSize=3', { headers: h15 })
    const nj = await notices.json()
    const link = (nj.data?.list ?? []).find(x => (x.link ?? '').includes('/me/invitations/'))?.link ?? ''
    const invId = String(link).split('/').pop()
    const reject = await fetch('/api/app/invitations/' + invId + '/respond', { method: 'POST', headers: h15, body: JSON.stringify({ action: 'reject' }) })
    out.reject = { invitationId: invId, status: reject.status, body: (await reject.text()).slice(0, 80) }
    const inv2 = await fetch('/api/app/me/enterprises/E2001/invite', { method: 'POST', headers: h1, body: JSON.stringify({ name: '许新言', phone: '13801210015', role: '联调邀请2' }) })
    out.invite2 = { status: inv2.status, body: (await inv2.text()).slice(0, 80) }
    const e = await fetch('/api/app/me/enterprises/E2001', { headers: h1 })
    const ej = await e.json()
    const pendingInvite = (ej.data?.invitations ?? []).find(x => x.status === 'pending')
    out.pendingInvite = pendingInvite ? { id: pendingInvite.id, name: pendingInvite.name } : null
    if (pendingInvite) {
      const revoke = await fetch('/api/app/me/enterprises/invitations/' + pendingInvite.id + '/revoke', { method: 'POST', headers: h1 })
      out.revoke = { status: revoke.status, body: (await revoke.text()).slice(0, 80) }
    }
    return out
  })
}
