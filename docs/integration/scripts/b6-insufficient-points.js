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
      return { token: j.data?.token ?? '', points: j.data?.points }
    }
    const u6 = await login('13801210006')
    const h6 = { Authorization: 'Bearer ' + u6.token, 'Content-Type': 'application/json' }
    const r = await fetch('/api/app/mall/orders', { method: 'POST', headers: h6, body: JSON.stringify({ goodsId: 'G1008' }) })
    return JSON.stringify({ points: u6.points, order: { status: r.status, body: (await r.text()).slice(0, 140) } })
  })
}
