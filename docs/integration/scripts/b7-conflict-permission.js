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
    const t2 = await login('13801210002')
    const h2 = { Authorization: 'Bearer ' + t2, 'Content-Type': 'application/json' }
    const other = await fetch('/api/app/spaces/reservations', { method: 'POST', headers: h2, body: JSON.stringify({ spaceId: 'S1002', date: '2026-09-22', start: '10:00', end: '11:00', purpose: '联调测试：他人已占用时段', attendees: 2 }) })
    out.otherUserConflict = { status: other.status, body: (await other.text()).slice(0, 140) }
    const t3 = await login('13801210003')
    const h3 = { Authorization: 'Bearer ' + t3, 'Content-Type': 'application/json' }
    const noPerm = await fetch('/api/app/spaces/reservations', { method: 'POST', headers: h3, body: JSON.stringify({ spaceId: 'S1003', date: '2026-09-24', start: '10:00', end: '11:00', purpose: '联调测试：无 space_reserve 权限代企业预约', attendees: 2, asIdentity: 'community_enterprise', asEnterpriseId: 'E2002' }) })
    out.memberWithoutPermission = { status: noPerm.status, body: (await noPerm.text()).slice(0, 140) }
    return out
  })
}
