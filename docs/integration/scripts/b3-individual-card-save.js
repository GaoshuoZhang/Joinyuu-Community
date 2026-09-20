async page => {
  await page.getByRole('spinbutton').first().fill('32')
  await page.getByPlaceholder('如：中共党员 / 共青团员 / 群众…').fill('群众')
  await page.getByPlaceholder('多个专长用、分隔，如：产品设计、用户研究…').fill('大模型应用、创业辅导、投融资')
  await page.getByPlaceholder('所在行业、年限与代表成果…').fill('人工智能（8 年），主导多个大模型行业落地项目')
  const respPromise = page.waitForResponse(r => r.url().includes('/cards/individual') && r.request().method() === 'PUT')
  await page.getByText('保存', { exact: true }).last().click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(900)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 100), request: resp.request().postData()?.slice(0, 260) })
}
