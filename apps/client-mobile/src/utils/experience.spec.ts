import { describe, expect, it } from 'vitest'
import type { ExperienceProfile } from '@/types'
import { experienceProgress } from './experience'

function profile(overrides: Partial<ExperienceProfile> = {}): ExperienceProfile {
  return {
    identityLabel: '社区个体',
    level: 3,
    levelName: '骨干',
    currentExperience: 450,
    currentLevelThreshold: 300,
    nextLevelThreshold: 600,
    records: [],
    ...overrides,
  }
}

describe('经验等级进度', () => {
  it('按当前等级区间计算进度和剩余经验，与流水是否为空无关', () => {
    expect(experienceProgress(profile())).toEqual({ percent: 50, remaining: 150, isHighestLevel: false })
  })

  it('下一等级门槛为空时展示最高等级状态', () => {
    expect(experienceProgress(profile({ currentExperience: 1200, currentLevelThreshold: 1000, nextLevelThreshold: null })))
      .toEqual({ percent: 100, remaining: null, isHighestLevel: true })
  })
})
