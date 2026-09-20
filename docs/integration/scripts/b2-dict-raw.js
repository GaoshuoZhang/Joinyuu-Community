async page => {
  return await page.evaluate(async () => {
    const r = await fetch('/api/app/dicts/demand_category')
    const j = await r.json()
    return JSON.stringify({ status: r.status, keys: Object.keys(j), dataSample: JSON.stringify(j.data).slice(0, 300) })
  })
}
