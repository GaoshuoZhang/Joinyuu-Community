async page => {
  const result = await page.evaluate(async () => {
    async function tryLogin(password) {
      const c = await fetch('/api/app/auth/captcha')
      const cj = await c.json()
      const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
      const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
      const r = await fetch('/api/app/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13900001234', password, captchaId: cj.data.captchaId, captchaCode: code }),
      })
      const j = await r.json()
      return { status: r.status, message: j.message ?? 'ok', uid: j.data?.uid }
    }
    return {
      oldFinal: await tryLogin('Final1234'),
      oldUser1234: await tryLogin('user1234'),
      newSecret: await tryLogin('Secret123'),
    }
  })
  return JSON.stringify(result)
}
