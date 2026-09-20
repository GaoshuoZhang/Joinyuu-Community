async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const exp = await fetch('/api/admin/export/users?page=1&pageSize=5', { headers: h })
    result.exportUsers = { status: exp.status, body: (await exp.text()).slice(0, 90) }
    const print = await fetch('/api/admin/applications/AP3018/print', { headers: h })
    result.printApproval = { status: print.status, body: (await print.text()).slice(0, 90) }
    const trash = await fetch('/api/admin/trash?page=1&pageSize=5', { headers: h })
    result.trash = { status: trash.status, body: (await trash.text()).slice(0, 90) }
    const monitor = await fetch('/api/admin/monitor/overview', { headers: h })
    result.monitor = { status: monitor.status, body: (await monitor.text()).slice(0, 90) }
    const assets = await fetch('/api/admin/assets?page=1&pageSize=5', { headers: h })
    result.assets = { status: assets.status, body: (await assets.text()).slice(0, 90) }
    return result
  })
}
