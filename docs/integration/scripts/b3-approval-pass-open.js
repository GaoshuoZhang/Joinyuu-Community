async page => {
  await page.getByRole('button', { name: '通过', exact: true }).click()
  await page.waitForTimeout(700)
  const tail = (await page.locator('body').innerText()).slice(-260)
  return JSON.stringify({ tail })
}
