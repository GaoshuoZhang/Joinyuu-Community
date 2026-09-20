async page => {
  const token = await page.evaluate(() => localStorage.getItem('joinyuu_admin_token'))
  const result = await page.evaluate(async t => {
    const r = await fetch('/api/app/me', { headers: { Authorization: 'Bearer ' + t } })
    return { status: r.status, body: await r.text() }
  }, token)
  return JSON.stringify(result)
}
