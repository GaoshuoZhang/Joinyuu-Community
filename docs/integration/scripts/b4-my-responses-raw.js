async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/responses', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({ status: r.status, keys: Object.keys(j.data ?? {}), sample: JSON.stringify(j.data).slice(0, 400) })
  })
}
