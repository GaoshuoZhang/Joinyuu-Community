async page => {
  const result = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const me = await fetch('/api/app/me', { headers: { Authorization: 'Bearer ' + t } })
    const meBody = await me.text()
    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const r = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13900001234', password: 'Secret123', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    return {
      me: { status: me.status, body: meBody.slice(0, 100) },
      login: { status: r.status, body: (await r.text()).slice(0, 100) },
    }
  })
  return JSON.stringify(result)
}
