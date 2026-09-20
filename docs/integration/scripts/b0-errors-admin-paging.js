async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const out = {}
    const probe = async (name, url) => {
      const r = await fetch(url, { headers: h })
      out[name] = { status: r.status, body: (await r.text()).slice(0, 160) }
    }
    await probe('noParams', '/api/admin/users')
    await probe('onlyPageSize', '/api/admin/users?pageSize=3')
    await probe('onlyPage', '/api/admin/users?page=1')
    await probe('hugePageSize', '/api/admin/users?page=1&pageSize=99999')
    await probe('hugePage', '/api/admin/users?page=99999&pageSize=3')
    return JSON.stringify(out)
  })
}
