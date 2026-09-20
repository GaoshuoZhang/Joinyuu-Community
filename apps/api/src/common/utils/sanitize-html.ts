import sanitizeHtmlLib from 'sanitize-html'

/* 富文本 HTML 清洁：白名单标签/属性，剥离 script/style/iframe 与事件属性、危险协议。
 * 基于 sanitize-html（真实 HTML 解析器，防斜杠分隔属性、实体编码、控制字符等正则绕过）；
 * 写入文章/需求/活动/公告/项目正文前统一调用。 */

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sub', 'sup', 'mark',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
]

const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  /* 危险块连内容整体剔除（与旧实现语义一致，且覆盖 noscript 等） */
  nonTextTags: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'textarea', 'option', 'noscript'],
}

/** 清洗富文本 HTML（白名单外标签去壳留内容，script/style 等危险块连内容剔除） */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  return sanitizeHtmlLib(html, OPTIONS)
}

/** 纯文本入参清洗（评论等）：剥离全部标签与危险块，仅保留文字内容，防止存储型 XSS。 */
export function sanitizePlainText(text: string): string {
  if (!text) return ''
  return sanitizeHtmlLib(text, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'textarea', 'option', 'noscript'],
  }).trim()
}
