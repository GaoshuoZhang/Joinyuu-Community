async page => {
  await page.goto('http://localhost:7759/projects')
  await page.waitForTimeout(2000)
  const body = await page.locator('body').innerText()
  return JSON.stringify({
    hasD4014: body.includes('联调测试：小程序数据看板开发合作'),
    categoryLabel: body.includes('技术开发'),
    totalLine: (body.match(/共 \d+ 条/) ?? [''])[0],
  })
}
