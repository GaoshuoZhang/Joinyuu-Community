async page => {
  await page.evaluate(() => localStorage.setItem('joinyuu_client_token', 'broken-token-for-test'))
  await page.goto('http://localhost:7759/me')
  await page.waitForTimeout(1800)
  return JSON.stringify({
    url: page.url(),
    loginButtonCount: await page.getByRole('button', { name: '登录' }).count(),
    tokenAfter: await page.evaluate(() => localStorage.getItem('joinyuu_client_token')),
  })
}
