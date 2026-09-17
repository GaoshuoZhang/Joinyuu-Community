import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/** 从验证码 SVG dataURL 还原答案（字符集 A-Z2-9，与 admin captcha 同实现） */
export function decodeAppCaptcha(image: string): string {
  const raw = image.slice(image.indexOf(',') + 1)
  const svg = decodeURIComponent(raw)
  const chars = [...svg.matchAll(/>([A-Z2-9])<\/text>/g)].map((m) => m[1])
  return chars.join('')
}

/** 获取 app 端图形验证码并解析明文答案 */
export async function fetchAppCaptcha(
  app: INestApplication,
): Promise<{ captchaId: string; captchaCode: string }> {
  const res = await request(app.getHttpServer()).get('/api/app/auth/captcha').expect(200)
  return { captchaId: res.body.data.captchaId, captchaCode: decodeAppCaptcha(res.body.data.image) }
}

/** 带验证码登录（返回完整响应，供断言失败场景） */
export async function appLoginRequest(
  app: INestApplication,
  phone = '13801210001',
  password = 'user123',
) {
  const { captchaId, captchaCode } = await fetchAppCaptcha(app)
  return request(app.getHttpServer())
    .post('/api/app/auth/login')
    .send({ phone, password, captchaId, captchaCode })
}

/** 带验证码登录（返回 token，成功场景快捷方式） */
export async function appLoginAs(
  app: INestApplication,
  phone = '13801210001',
  password = 'user123',
): Promise<string> {
  const res = await appLoginRequest(app, phone, password)
  return res.body.data.token
}

/** 带 token 的 GET 快捷方式 */
export const appGet = (
  app: INestApplication,
  token: string,
  path: string,
): request.Test =>
  request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)

/** 带 token 的 POST 快捷方式 */
export const appPost = (
  app: INestApplication,
  token: string,
  path: string,
  body?: Record<string, unknown>,
): request.Test =>
  request(app.getHttpServer())
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body ?? {})
