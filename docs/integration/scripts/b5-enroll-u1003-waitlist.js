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
    const t3 = await login('13801210003')
    const h3 = { Authorization: 'Bearer ' + t3, 'Content-Type': 'application/json' }
    const enroll = await fetch('/api/app/events/EV6010/enroll', { method: 'POST', headers: h3, body: '{}' })
    out.u1003Enroll = { status: enroll.status, body: (await enroll.text()).slice(0, 120) }
    const mine = await fetch('/api/app/me/enrollments', { headers: h3 })
    const mj = await mine.json()
    const list = Array.isArray(mj.data) ? mj.data : (mj.data?.list ?? [])
    const ev = list.find(x => x.eventId === 'EV6010' || x.id === 'EV6010')
    out.u1003Enrollment = ev ? { status: ev.status, waitlistOrder: ev.waitlistOrder ?? ev.waitlistPosition } : null
    return out
  })
}
