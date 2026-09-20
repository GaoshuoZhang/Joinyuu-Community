async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const archive = await fetch('/api/admin/demands/D4011/archive', { method: 'POST', headers: h })
    out.archiveDemand = { status: archive.status, body: (await archive.text()).slice(0, 100) }
    const list1 = await fetch('/api/admin/trash?domain=demand&page=1&pageSize=10', { headers: h })
    const lj1 = await list1.json()
    out.trashDemand = { status: list1.status, ids: (lj1.data?.list ?? []).map(x => x.id) }
    const restore = await fetch('/api/admin/trash/demand/D4011/restore', { method: 'POST', headers: h })
    out.restoreDemand = { status: restore.status, body: (await restore.text()).slice(0, 100) }
    const d = await fetch('/api/admin/demands?keyword=D4011&page=1&pageSize=1', { headers: h })
    out.demandAfterRestore = ((await d.json()).data?.list?.[0])?.status
    const archiveOrder = await fetch('/api/admin/mall/redemption-orders/RO2006/archive', { method: 'POST', headers: h })
    out.archiveOrder = { status: archiveOrder.status, body: (await archiveOrder.text()).slice(0, 100) }
    const list2 = await fetch('/api/admin/trash?domain=mallOrder&page=1&pageSize=10', { headers: h })
    const lj2 = await list2.json()
    out.trashOrder = { status: list2.status, ids: (lj2.data?.list ?? []).map(x => x.id) }
    const purge = await fetch('/api/admin/trash/mallOrder/RO2006/purge', { method: 'POST', headers: h })
    out.purgeOrder = { status: purge.status, body: (await purge.text()).slice(0, 100) }
    const list3 = await fetch('/api/admin/trash?domain=mallOrder&page=1&pageSize=10', { headers: h })
    out.trashAfterPurge = ((await list3.json()).data?.list ?? []).map(x => x.id)
    const settings = await fetch('/api/admin/trash/settings', { headers: h })
    const sj = await settings.json()
    const demandSetting = (Array.isArray(sj.data) ? sj.data : []).find(x => x.domain === 'demand')
    out.demandSetting = demandSetting ? { autoArchive: demandSetting.autoArchive, archiveDelayDays: demandSetting.archiveDelayDays, autoPurge: demandSetting.autoPurge, purgeDelayDays: demandSetting.purgeDelayDays, statuses: demandSetting.archivableStatuses?.length } : null
    return out
  })
}
