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
    const t5 = await login('13801210005')
    const h5 = { Authorization: 'Bearer ' + t5, 'Content-Type': 'application/json' }
    const r = await fetch('/api/app/events/EV6010/enroll', { method: 'POST', headers: h5, body: '{}' })
    return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 140) })
  })
}
