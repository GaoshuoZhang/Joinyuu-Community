async page => {
  const result = await page.evaluate(async () => {
    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const r = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13900001234', password: 'Reset1234', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    const j = await r.json()
    return { status: r.status, token: j.data?.token ?? '', message: j.message ?? '' }
  })
  return JSON.stringify(result)
}
