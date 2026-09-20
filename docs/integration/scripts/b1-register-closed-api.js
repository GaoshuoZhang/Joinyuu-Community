async page => {
  const result = await page.evaluate(async () => {
    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const r = await fetch('/api/app/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: '被拦截注册', phone: '13911112222', password: 'user1234', confirmPassword: 'user1234', captchaId: cj.data.captchaId, captchaCode: code, agreed: true }),
    })
    const cfg = await fetch('/api/app/config')
    const cfgj = await cfg.json()
    return {
      register: { status: r.status, body: (await r.text()).slice(0, 100) },
      config: { registrationOpen: cfgj.data?.registrationOpen, siteName: cfgj.data?.siteName },
    }
  })
  return JSON.stringify(result)
}
