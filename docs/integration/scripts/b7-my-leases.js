async page => {
  const out = {}
  await page.goto('http://localhost:7759/me/leases')
  await page.waitForTimeout(1800)
  out.page = (await page.locator('body').innerText()).slice(0, 500)
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/leases', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    const list = Array.isArray(j.data) ? j.data : (j.data?.list ?? [])
    return { status: r.status, list: list.slice(0, 3).map(x => ({ id: x.id, renter: x.renterName, status: x.status, endDate: x.endDate })) }
  })
  return JSON.stringify(out)
}
