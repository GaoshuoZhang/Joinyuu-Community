/* M1.5 R5 富文本清洁 e2e：
 * 覆盖：清洗器绕过向量（斜杠分隔属性/实体编码/控制字符/data 协议）、白名单保留、
 *       公告写入时 HTML 白名单清洗（剥离 script/事件属性），文章清洗见 contents 套件。
 * 前置：seed。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { sanitizeHtml } from '../src/common/utils/sanitize-html'

describe('M1.5 R5 富文本清洁', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    token = await loginAs(app)
  })

  afterAll(async () => {
    await app.close()
  })

  const auth = () => ({ Authorization: `Bearer ${token}` })

  it('清洗器：历史绕过向量全部失效（斜杠属性/实体编码/控制字符/data 协议）', () => {
    const payloads = [
      '<img src=x onerror=alert(1)>',
      '<img/src=x onerror=alert(1)>',
      '<a/href="javascript:alert(1)">x</a>',
      '<a href="java&#115;cript:alert(1)">x</a>',
      '<a href="jav&#x61;script:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
      '<svg/onload=alert(1)>',
      '<p onclick="alert(1)">t</p>',
      '<noscript><img src=x onerror=alert(1)></noscript>',
    ]
    for (const dirty of payloads) {
      const clean = sanitizeHtml(dirty).toLowerCase()
      for (const bad of ['onerror', 'onload', 'onclick', 'javascript', 'data:text/html', '<script', '<svg', '<iframe', '<noscript']) {
        expect(clean).not.toContain(bad)
      }
    }
  })

  it('清洗器：保留白名单标签与安全链接', () => {
    const clean = sanitizeHtml(
      '<p>正文</p><strong>加粗</strong><a href="https://example.com" target="_blank">链接</a>',
    )
    expect(clean).toContain('<p>正文</p>')
    expect(clean).toContain('<strong>加粗</strong>')
    expect(clean).toContain('href="https://example.com"')
  })

  it('公告正文：剥离 <script> 与事件属性，保留白名单标签', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/announcements')
      .set(auth())
      .send({
        title: '清洁测试公告',
        content: '<p>正常内容</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
        pinned: false,
      })
    expect(create.status).toBe(200)
    const content = create.body.data.content as string
    expect(content).toContain('正常内容')
    expect(content).toContain('<p>')
    expect(content).not.toContain('script')
    expect(content).not.toContain('onerror')
  })

  it('公告正文：斜杠分隔属性等绕过向量在落库前被清洗', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/announcements')
      .set(auth())
      .send({
        title: '绕过向量测试公告',
        content: '<a/href="javascript:alert(1)">点我</a><img/src=x onerror=alert(1)>',
        pinned: false,
      })
    expect(create.status).toBe(200)
    const content = create.body.data.content as string
    expect(content).not.toContain('javascript')
    expect(content).not.toContain('onerror')
    expect(content).toContain('点我')
  })
})
