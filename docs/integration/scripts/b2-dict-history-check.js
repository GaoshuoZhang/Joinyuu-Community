async page => {
  await page.goto('http://localhost:7759/projects')
  await page.waitForTimeout(1800)
  const body = await page.locator('body').innerText()
  const api = await page.evaluate(async () => {
    const r = await fetch('/api/app/dicts/demand_category')
    const j = await r.json()
    const d = j.data
    const list = Array.isArray(d) ? d : (d?.list ?? [])
    return list.map(x => x.label)
  })
  const chipButtons = await page.getByRole('button', { name: '供应链' }).count()
  return JSON.stringify({
    dictLabels: api,
    historyCardShowsLabel: body.includes('供应链'),
    demanP1TitleVisible: body.includes('寻找柔性电路板打样供应商'),
    supplierButtonCount: chipButtons,
  })
}
