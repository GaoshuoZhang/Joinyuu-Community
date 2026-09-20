import { describe, expect, it } from 'vitest'
import {
  articleContentVisibleTextLength,
  articleInsertionAnchor,
  moveArticleContentBlock,
  parseArticleContent,
  resolveArticleInsertionIndex,
  serializeArticleContent,
  type ArticleContentBlock,
} from './articleContent'

function parse(content: string) {
  let id = 0
  return parseArticleContent(content, () => ++id)
}

describe('article content codec', () => {
  it('serializes escaped wangEditor-compatible HTML and rejects unsafe image URLs', () => {
    const blocks: ArticleContentBlock[] = [
      { id: 1, type: 'text', text: 'A < B & "quoted"\nnext' },
      { id: 2, type: 'image', url: 'https://cdn.test/image?a=1&b="2"' },
      { id: 3, type: 'image', url: 'javascript:alert(1)' },
    ]

    expect(serializeArticleContent(blocks)).toBe(
      '<p>A &lt; B &amp; &quot;quoted&quot;<br>next</p><p><img src="https://cdn.test/image?a=1&amp;b=&quot;2&quot;" alt="正文图片"></p>',
    )
  })

  it('parses canonical rich HTML in text/image order and counts visible text', () => {
    const blocks = parse('<p>第一段<br>第二行</p><p><img src="/files/a.png" alt="a"></p><h2>末段 &amp; 更多</h2>')

    expect(blocks.map(({ type }) => type)).toEqual(['text', 'image', 'text'])
    expect(blocks[0]).toMatchObject({ text: '第一段\n第二行' })
    expect(blocks[1]).toMatchObject({ url: '/files/a.png' })
    expect(blocks[2]).toMatchObject({ text: '末段 & 更多' })
    expect(articleContentVisibleTextLength('<p>第一段<br>第二行</p><img src="/a.png"><p>末段</p>')).toBe(9)
  })

  it('treats non-HTML input as one plain text block', () => {
    expect(parse('第一行\n\n第二行')).toEqual([
      { id: 1, type: 'text', text: '第一行\n\n第二行' },
    ])
    expect(parse('   ')).toEqual([])
  })

  it('resolves delayed insertions from adjacent block ids', () => {
    const blocks: ArticleContentBlock[] = [
      { id: 1, type: 'text', text: 'A' },
      { id: 2, type: 'text', text: 'B' },
    ]
    const anchor = articleInsertionAnchor(blocks, 1)
    blocks.unshift({ id: 3, type: 'text', text: 'earlier edit' })
    expect(resolveArticleInsertionIndex(blocks, anchor)).toBe(2)

    blocks.splice(2, 1)
    expect(resolveArticleInsertionIndex(blocks, anchor)).toBe(2)
  })

  it('reorders text and image blocks in the serialized article', () => {
    const blocks: ArticleContentBlock[] = [
      { id: 1, type: 'text', text: '第一段' },
      { id: 2, type: 'image', url: '/files/a.png' },
      { id: 3, type: 'text', text: '第二段' },
    ]

    const reordered = moveArticleContentBlock(blocks, 1, 1)
    expect(reordered.map((block) => block.id)).toEqual([1, 3, 2])
    expect(serializeArticleContent(reordered)).toBe(
      '<p>第一段</p><p>第二段</p><p><img src="/files/a.png" alt="正文图片"></p>',
    )
  })
})
