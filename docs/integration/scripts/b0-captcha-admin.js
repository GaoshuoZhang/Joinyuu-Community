async page => {
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/admin/auth/captcha')
    const j = await r.json()
    const svg = decodeURIComponent(String(j.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    return { captchaId: j.data.captchaId, code }
  })
  return JSON.stringify(result)
}
