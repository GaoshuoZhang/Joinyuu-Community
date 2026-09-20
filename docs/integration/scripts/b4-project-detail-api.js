async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/projects/P5009', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({ status: r.status, keys: Object.keys(j.data ?? {}), initiator: j.data?.initiatorName ?? j.data?.initiator ?? j.data?.ownerName, sample: JSON.stringify(j.data).slice(0, 500) })
  })
}
