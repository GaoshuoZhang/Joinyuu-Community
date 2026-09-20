async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const put = await fetch('/api/admin/trash/settings/demand', { method: 'PUT', headers: h, body: JSON.stringify({ autoArchive: true, archiveDelayDays: 15, autoPurge: true, purgeDelayDays: 60 }) })
    out.updateSetting = { status: put.status, body: (await put.text()).slice(0, 140) }
    const s = await fetch('/api/admin/trash/settings', { headers: h })
    const demand = ((await s.json()).data ?? []).find(x => x.domain === 'demand')
    out.after = { autoArchive: demand.autoArchive, archiveDelayDays: demand.archiveDelayDays, autoPurge: demand.autoPurge, purgeDelayDays: demand.purgeDelayDays }
    const logs = await fetch('/api/admin/audit-logs?keyword=%E5%BD%92%E6%A1%A3&page=1&pageSize=5', { headers: h })
    out.audit = ((await logs.json()).data?.list ?? []).map(x => ({ action: x.action, target: x.target, at: x.at }))
    const restore = await fetch('/api/admin/trash/settings/demand', { method: 'PUT', headers: h, body: JSON.stringify({ autoArchive: false, archiveDelayDays: 7, autoPurge: false, purgeDelayDays: 30 }) })
    out.restoreSetting = { status: restore.status }
    const cron = await fetch('/api/admin/monitor/cron-logs', { headers: h })
    const cj = await cron.json()
    const list = Array.isArray(cj.data) ? cj.data : (cj.data?.list ?? [])
    out.cronLogs = { status: cron.status, count: list.length, names: [...new Set(list.map(x => x.jobName ?? x.name))].slice(0, 8) }
    return out
  })
}
