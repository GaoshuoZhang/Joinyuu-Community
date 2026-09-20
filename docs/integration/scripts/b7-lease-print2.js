async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const print = await fetch('/api/admin/leases/LS2002/print', { headers: h })
    const pj = await print.json()
    return JSON.stringify({ status: print.status, title: pj.data?.title, clauseCount: (pj.data?.clauses ?? []).length, generatedAt: pj.data?.generatedAt, lease: pj.data?.lease ? { id: pj.data.lease.id, renterName: pj.data.lease.renterName } : null })
  })
}
