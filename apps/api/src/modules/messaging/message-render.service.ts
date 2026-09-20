import { BadRequestException, Injectable } from '@nestjs/common'

/** 模板占位符：{{name}}（允许内部空白） */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

/** 模板渲染与变量白名单校验（P0 模板中心）：变量必须同时满足「在白名单内」与「已提供值」 */
@Injectable()
export class MessageRenderService {
  /** 提取文本中引用的变量名 */
  placeholders(text: string | undefined): string[] {
    if (!text) return []
    const found = new Set<string>()
    for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1])
    return [...found]
  }

  /** 校验：未在白名单内 / 白名单内声明但模板未使用 / 渲染值缺失 */
  assertTemplate(allowed: string[], subject: string | undefined, body: string): void {
    const allow = new Set(allowed)
    const used = new Set([...this.placeholders(subject), ...this.placeholders(body)])

    const unknown = [...used].filter((name) => !allow.has(name))
    if (unknown.length > 0) {
      throw new BadRequestException(`模板变量未在白名单内：${unknown.join('、')}`)
    }
    if (!body.trim()) throw new BadRequestException('模板正文不能为空')
  }

  /** 校验渲染值齐备（发送前调用；白名单外的多余变量忽略） */
  assertRenderable(allowed: string[], subject: string | undefined, body: string, variables: Record<string, string>): void {
    const used = new Set([...this.placeholders(subject), ...this.placeholders(body)])
    const allow = new Set(allowed)
    const missing = [...used].filter((name) => allow.has(name) && !(name in variables))
    if (missing.length > 0) {
      throw new BadRequestException(`缺少模板变量：${missing.join('、')}`)
    }
  }

  /** 渲染占位符；未提供值的占位符原样保留（由 assertRenderable 拦截） */
  render(text: string | undefined, variables: Record<string, string>): string {
    if (!text) return ''
    return text.replace(PLACEHOLDER, (raw, name: string) => variables[name] ?? raw)
  }
}
