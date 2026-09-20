async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const print = await fetch('/api/admin/workstation-leases/LS2002/print', { headers: h })
    const pj = await print.json()
    out.print = { status: print.status, title: pj.data?.title, clauses: (pj.data?.clauses ?? []).length, generatedAt: pj.data?.generatedAt }
    return out
  })
}
