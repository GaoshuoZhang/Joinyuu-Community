async page => {
  const input = page.locator('input[type="file"]').first()
  await input.setInputFiles('D:/Projects/Joinyuu-Community/docs/integration/assets/avatar-big.png')
  await page.waitForTimeout(1000)
  const body = await page.locator('body').innerText()
  return JSON.stringify({
    hasSizeToast: body.includes('5MB'),
    toastText: body.split('\n').filter(x => x.includes('MB') || x.includes('上传')).join(' | '),
  })
}
