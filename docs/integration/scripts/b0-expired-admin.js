async page => {
  await page.evaluate(() => localStorage.setItem('joinyuu_admin_token', 'broken-token-for-test'))
  await page.goto('http://localhost:7758/#/demands')
  await page.waitForTimeout(1800)
  return JSON.stringify({
    url: page.url(),
    loginFormCount: await page.getByRole('button', { name: '登 录' }).count(),
    tokenAfter: await page.evaluate(() => localStorage.getItem('joinyuu_admin_token')),
  })
}
