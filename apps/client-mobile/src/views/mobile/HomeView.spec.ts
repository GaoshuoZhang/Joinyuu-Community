import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve('src/views/mobile/HomeView.vue'), 'utf8')

describe('HomeView content contract', () => {
  it('展示最新需求和最新资讯，并移除推荐区块和旧标签', () => {
    expect(source).toContain('title="最新需求"')
    expect(source).toContain('empty-text="暂无最新需求"')
    expect(source).toContain('title="最新资讯"')
    expect(source).toContain('empty-text="暂无最新资讯"')
    expect(source).not.toMatch(/为你推荐|最新项目|精选文章|recommendationItems/)
  })
})
