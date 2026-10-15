import type { MyResponseItem } from '@/types'

export function activeRespondedDemandIds(responses: MyResponseItem[]): Set<string> {
  return new Set(responses.filter((response) => !response.withdrawnAt).map((response) => response.demandId))
}
