import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/** 从验证码 SVG dataURL 还原答案（每个字符单独 <text>，字符集 A-Z2-9 去掉 0/O/1/I） */
export function decodeCaptcha(image: string): string {
  const raw = image.slice(image.indexOf(',') + 1)
  const svg = decodeURIComponent(raw)
  const chars = [...svg.matchAll(/>([A-Z2-9])<\/text>/g)].map((m) => m[1])
  return chars.join('')
}

/** 获取验证码并解析明文答案（R3 起登录必填） */
export async function fetchCaptcha(app: INestApplication): Promise<{ captchaId: string; captchaCode: string }> {
  const res = await request(app.getHttpServer()).get('/api/admin/auth/captcha')
  return { captchaId: res.body.data.captchaId, captchaCode: decodeCaptcha(res.body.data.image) }
}

/** 带验证码登录（返回完整响应，供断言失败场景使用） */
export async function loginRequest(app: INestApplication, username: string, password = 'admin123') {
  const { captchaId, captchaCode } = await fetchCaptcha(app)
  return request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ username, password, captchaId, captchaCode })
}

/** 带验证码登录（返回 token，成功场景快捷方式） */
export async function loginAs(app: INestApplication, username = 'admin', password = 'admin123'): Promise<string> {
  const res = await loginRequest(app, username, password)
  return res.body.data.token
}
