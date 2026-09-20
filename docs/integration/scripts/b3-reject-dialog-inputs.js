async page => {
  const dialog = page.locator('.t-dialog', { hasText: '驳回审核' }).first()
  const inputs = dialog.locator('input, textarea')
  const count = await inputs.count()
  const info = []
  for (let i = 0; i < count; i++) info.push(await inputs.nth(i).getAttribute('placeholder'))
  return JSON.stringify({ count, placeholders: info })
}
