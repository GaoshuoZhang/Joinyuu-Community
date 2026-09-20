async page => {
  const out = {}
  await page.goto('http://localhost:7759/community')
  await page.waitForTimeout(1800)
  out.community = (await page.locator('body').innerText()).slice(0, 200)
  const api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const p = await fetch('/api/app/community/policies', { headers: h })
    const pj = await p.json()
    const plist = Array.isArray(pj.data) ? pj.data : (pj.data?.list ?? [])
    result.policies = { status: p.status, count: plist.length, first: plist[0]?.title }
    const t2 = await fetch('/api/app/community/talents', { headers: h })
    const tj = await t2.json()
    const tlist = Array.isArray(tj.data) ? tj.data : (tj.data?.list ?? [])
    result.talents = { status: t2.status, count: tlist.length, first: tlist[0]?.name }
    const e = await fetch('/api/app/community/enterprises', { headers: h })
    const ej = await e.json()
    const elist = Array.isArray(ej.data) ? ej.data : (ej.data?.list ?? [])
    result.enterprises = { status: e.status, count: elist.length, first: elist[0]?.name ?? elist[0]?.enterpriseName }
    return result
  })
  out.api = api
  await page.goto('http://localhost:7759/talents/U1001')
  await page.waitForTimeout(1500)
  out.talentCard = (await page.locator('body').innerText()).slice(0, 160)
  return JSON.stringify(out)
}
