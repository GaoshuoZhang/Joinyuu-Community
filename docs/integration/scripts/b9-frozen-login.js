async page => {
  return await page.evaluate(async () => {
    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const r = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13801210014', password: 'user123', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    return JSON.stringify({ frozenLogin: { status: r.status, body: (await r.text()).slice(0, 140) } })
  })
}
