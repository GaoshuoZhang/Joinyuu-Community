async page => {
  const out = {}
  await page.getByRole('button', { name: '新增收货地址' }).click()
  await page.waitForTimeout(700)
  const tailBefore = (await page.locator('body').innerText()).slice(-200)
  const inputs = page.locator('input:visible')
  const values = ['陈屿', '13801210001', '浙江省杭州市余杭区未来科技城聚屿社区 3 号楼 501']
  const count = Math.min(await inputs.count(), 3)
  for (let i = 0; i < count; i++) {
    const ph = (await inputs.nth(i).getAttribute('placeholder')) ?? ''
    if (ph.includes('收货人')) await inputs.nth(i).fill(values[0])
    else if (ph.includes('手机号')) await inputs.nth(i).fill(values[1])
    else if (ph.includes('地址') || ph.includes('门牌')) await inputs.nth(i).fill(values[2])
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/addresses'))
  await page.getByRole('button', { name: '保存' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 200) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 70), tail: (await page.locator('body').innerText()).slice(-160) }
  }
  await page.waitForTimeout(1000)
  out.tailBefore = tailBefore.slice(-80)
  out.tail = (await page.locator('body').innerText()).slice(-140)
  return JSON.stringify(out)
}
