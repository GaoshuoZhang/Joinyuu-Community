async page => {
  const token = await page.evaluate(() => localStorage.getItem('joinyuu_client_token'))
  const result = await page.evaluate(async t => {
    const r = await fetch('/api/admin/dashboard', { headers: { Authorization: 'Bearer ' + t } })
    return { status: r.status, body: await r.text() }
  }, token)
  return JSON.stringify(result)
}
