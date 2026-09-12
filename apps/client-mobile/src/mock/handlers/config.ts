import type { AppConfig, DictItem } from '@/types'
import { appConfig, dicts } from '@/mock/db'
import { withLatency } from '@/mock/latency'

export async function fetchAppConfig(): Promise<AppConfig> {
  return withLatency(() => ({ ...appConfig }), 80)
}

export async function fetchDict(type: string): Promise<DictItem[]> {
  return withLatency(() => [...(dicts[type] ?? [])], 120)
}
