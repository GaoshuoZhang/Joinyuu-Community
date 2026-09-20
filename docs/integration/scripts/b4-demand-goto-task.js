async page => {
  const btn = page.getByRole('button', { name: '发布需求' }).first()
  await btn.click({ force: true })
  await page.waitForTimeout(1800)
  return JSON.stringify({ url: page.url() })
}
