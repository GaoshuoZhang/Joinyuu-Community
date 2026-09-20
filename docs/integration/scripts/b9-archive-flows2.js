async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const archiveDemand = await fetch('/api/admin/demands/D4012/archive', { method: 'POST', headers: h })
    out.archiveD4012 = { status: archiveDemand.status, body: (await archiveDemand.text()).slice(0, 100) }
    const t1 = await fetch('/api/admin/trash?domain=demand&page=1&pageSize=10', { headers: h })
    out.trashDemand = ((await t1.json()).data?.list ?? []).map(x => ({ id: x.id, title: x.title, deletedBy: x.deletedBy }))
    const restore = await fetch('/api/admin/trash/demand/D4012/restore', { method: 'POST', headers: h })
    out.restoreD4012 = { status: restore.status, body: (await restore.text()).slice(0, 100) }
    const d = await fetch('/api/admin/demands?keyword=D4012&page=1&pageSize=1', { headers: h })
    out.d4012After = ((await d.json()).data?.list?.[0])?.status

    const archiveRes = await fetch('/api/admin/space-reservations/SR2013/archive', { method: 'POST', headers: h })
    out.archiveSR2013 = { status: archiveRes.status, body: (await archiveRes.text()).slice(0, 100) }
    const t2 = await fetch('/api/admin/trash?domain=reservation&page=1&pageSize=10', { headers: h })
    out.trashReservation = ((await t2.json()).data?.list ?? []).map(x => ({ id: x.id, title: x.title }))
    const purge = await fetch('/api/admin/trash/reservation/SR2013/purge', { method: 'POST', headers: h })
    out.purgeSR2013 = { status: purge.status, body: (await purge.text()).slice(0, 100) }
    const t3 = await fetch('/api/admin/trash?domain=reservation&page=1&pageSize=10', { headers: h })
    out.trashReservationAfter = ((await t3.json()).data?.list ?? []).map(x => x.id)

    const archiveOrder = await fetch('/api/admin/mall/redemption-orders/RO2002/archive', { method: 'POST', headers: h })
    out.archiveRO2002 = { status: archiveOrder.status }
    const t4 = await fetch('/api/admin/trash?domain=order&page=1&pageSize=10', { headers: h })
    out.trashOrder = ((await t4.json()).data?.list ?? []).map(x => x.id)
    const restoreOrder = await fetch('/api/admin/trash/order/RO2002/restore', { method: 'POST', headers: h })
    out.restoreRO2002 = { status: restoreOrder.status, body: (await restoreOrder.text()).slice(0, 100) }
    return out
  })
}
