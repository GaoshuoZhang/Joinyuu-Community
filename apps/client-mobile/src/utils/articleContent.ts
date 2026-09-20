export type ArticleContentBlock =
  | { id: number; type: 'text'; text: string }
  | { id: number; type: 'image'; url: string }

export interface ArticleInsertionAnchor {
  beforeId: number | null
  afterId: number | null
}

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'HEADER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE',
  'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
])
const IGNORED_TAGS = new Set(['IFRAME', 'NOSCRIPT', 'OBJECT', 'SCRIPT', 'STYLE', 'TEMPLATE'])

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeImageUrl(value: string): string | null {
  const url = value.trim()
  if (!url || /[\u0000-\u001f\u007f]/.test(url) || url.startsWith('//')) return null
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || /^\.\.?(?:\/|$)/.test(url)) return url
  return null
}

/** Serialize the mobile block model to the same safe HTML shape consumed by wangEditor. */
export function serializeArticleContent(blocks: readonly ArticleContentBlock[]): string {
  return blocks.flatMap((block) => {
    if (block.type === 'image') {
      const url = safeImageUrl(block.url)
      return url ? [`<p><img src="${escapeHtml(url)}" alt="正文图片"></p>`] : []
    }
    const text = block.text.trim()
    return text ? [`<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`] : []
  }).join('')
}

function parseHtml(content: string, nextId: () => number): ArticleContentBlock[] {
  const document = new DOMParser().parseFromString(content, 'text/html')
  const blocks: ArticleContentBlock[] = []
  let text = ''

  const flushText = () => {
    const value = text.replaceAll('\u00a0', ' ').trim()
    if (value) blocks.push({ id: nextId(), type: 'text', text: value })
    text = ''
  }

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (!(node instanceof HTMLElement) || IGNORED_TAGS.has(node.tagName)) return
    if (node.tagName === 'IMG') {
      flushText()
      const url = safeImageUrl(node.getAttribute('src') ?? '')
      if (url) blocks.push({ id: nextId(), type: 'image', url })
      return
    }
    if (node.tagName === 'BR') {
      text += '\n'
      return
    }
    node.childNodes.forEach(visit)
    if (BLOCK_TAGS.has(node.tagName)) flushText()
  }

  document.body.childNodes.forEach(visit)
  flushText()
  return blocks
}

/** Parse canonical HTML, with a single text block fallback for non-HTML input. */
export function parseArticleContent(content: string, nextId: () => number): ArticleContentBlock[] {
  if (/<\/?[a-z][^>]*>/i.test(content)) return parseHtml(content, nextId)
  const text = content.trim()
  return text ? [{ id: nextId(), type: 'text', text }] : []
}

export function articleVisibleTextLength(blocks: readonly ArticleContentBlock[]): number {
  return blocks.reduce((total, block) => total + (block.type === 'text' ? block.text.trim().length : 0), 0)
}

export function articleContentVisibleTextLength(content: string): number {
  let id = 0
  return articleVisibleTextLength(parseArticleContent(content, () => ++id))
}

export function moveArticleContentBlock(
  blocks: readonly ArticleContentBlock[],
  index: number,
  offset: -1 | 1,
): ArticleContentBlock[] {
  const target = index + offset
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) return [...blocks]
  const next = [...blocks]
  const [block] = next.splice(index, 1)
  if (block) next.splice(target, 0, block)
  return next
}

export function articleInsertionAnchor(blocks: readonly ArticleContentBlock[], index: number): ArticleInsertionAnchor {
  return {
    beforeId: blocks[index]?.id ?? null,
    afterId: blocks[index - 1]?.id ?? null,
  }
}

/** Resolve an async insertion against surviving neighbors rather than a stale numeric index. */
export function resolveArticleInsertionIndex(blocks: readonly ArticleContentBlock[], anchor: ArticleInsertionAnchor): number {
  if (anchor.beforeId !== null) {
    const before = blocks.findIndex((block) => block.id === anchor.beforeId)
    if (before >= 0) return before
  }
  if (anchor.afterId !== null) {
    const after = blocks.findIndex((block) => block.id === anchor.afterId)
    if (after >= 0) return after + 1
  }
  return blocks.length
}
