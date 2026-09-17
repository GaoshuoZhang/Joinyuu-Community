export const publishingActions = ['demand_publish', 'article_publish', 'event_enroll', 'space_reserve'] as const

export const personalPublishingLimitSeeds = [
  { identityType: 'personal_unverified', limits: [-1, -1, -1, -1] },
  { identityType: 'personal_verified', limits: [-1, -1, -1, -1] },
].flatMap(({ identityType, limits }) => publishingActions.map((action, index) => ({
  identityType,
  level: 0,
  action,
  dailyLimit: limits[index],
})))

export function levelPublishingLimitSeeds(identityType: 'community_individual' | 'community_enterprise', levels: number[]) {
  return levels.flatMap(level => publishingActions.map(action => ({
    identityType,
    level,
    action,
    dailyLimit: -1,
  })))
}
