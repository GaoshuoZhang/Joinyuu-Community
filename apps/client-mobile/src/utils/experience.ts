import type { ExperienceProfile } from '@/types'

export function experienceProgress(profile: ExperienceProfile): {
  percent: number
  remaining: number | null
  isHighestLevel: boolean
} {
  if (profile.nextLevelThreshold === null) {
    return { percent: 100, remaining: null, isHighestLevel: true }
  }
  const levelSpan = profile.nextLevelThreshold - profile.currentLevelThreshold
  const withinLevel = profile.currentExperience - profile.currentLevelThreshold
  const percent = levelSpan > 0 ? Math.min(100, Math.max(0, Math.round((withinLevel / levelSpan) * 100))) : 0
  return {
    percent,
    remaining: Math.max(0, profile.nextLevelThreshold - profile.currentExperience),
    isHighestLevel: false,
  }
}
