async page => {
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/app/me', { headers: { Authorization: 'Bearer __TOKEN__' } })
    return { status: r.status, body: await r.text() }
  })
  return JSON.stringify(result)
}
