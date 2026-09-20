async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/enterprises/E2001', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({ exitApplication: j.data?.exitApplication, isContact: j.data?.isContact })
  })
}
