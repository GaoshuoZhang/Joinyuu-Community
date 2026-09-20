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
    const out = { login: { status: login.status, uid: lj.data?.uid, identities: lj.data?.identities?.map(x => x.type) } }
    const n = await fetch('/api/app/notices?page=1&pageSize=5', { headers: h })
    const nj = await n.json()
    const inviteNotice = (nj.data?.list ?? []).find(x => (x.title ?? '').includes('邀请'))
    out.inviteNotice = inviteNotice ? { title: inviteNotice.title, link: inviteNotice.link } : null
    const invId = String(inviteNotice?.link ?? '').split('/').pop()
    const detail = await fetch('/api/app/invitations/' + invId, { headers: h })
    const dj = await detail.json()
    out.invitation = { status: detail.status, id: invId, data: dj.data ? { enterpriseName: dj.data.enterpriseName, role: dj.data.role, status: dj.data.status } : null }
    const respond = await fetch('/api/app/invitations/' + invId + '/respond', { method: 'POST', headers: h, body: JSON.stringify({ action: 'accept' }) })
    out.accept = { status: respond.status, body: (await respond.text()).slice(0, 100) }
    const me = await fetch('/api/app/me', { headers: h })
    const mj = await me.json()
    out.afterIdentities = (mj.data?.identities ?? []).map(x => x.type)
    const e = await fetch('/api/app/me/enterprises/E2001', { headers: h })
    const ej = await e.json()
    out.enterprise = { status: e.status, name: ej.data?.enterpriseName, isContact: ej.data?.isContact, myPermissions: ej.data?.myPermissions }
    out.memberToken = t
    return out
  })
}
