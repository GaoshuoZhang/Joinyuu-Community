import { ref } from 'vue'

/* [MOCK-ONLY] v34 运行时：版本化快照、可控业务时钟、稳定发号与网络场景。 */

export type MockNetworkMode = 'normal' | 'slow' | 'offline' | 'error' | 'timeout'

export interface MockRuntimeState {
  nowMs: number
  networkMode: MockNetworkMode
  sequences: Record<string, number>
}

interface StoredMockState {
  version: 34
  revision: 1
  runtime: MockRuntimeState
  data: unknown
}

const STORAGE_KEY = 'joinyuu_client_mock_v34'
const mockEnabled = import.meta.env.VITE_API_MODE === 'mock'
const SESSION_KEY = 'joinyuu_client_token'
const DEFAULT_NOW_MS = new Date(2026, 8, 15, 10, 0, 0, 0).getTime()
const DEFAULT_SEQUENCES: Record<string, number> = {
  U: 1021,
  E: 2010,
  AP: 3200,
  D: 4020,
  DR: 9200,
  EE: 7200,
  RO: 2100,
  SR: 5200,
  SU: 1100,
  PT: 5000,
  UN: 5000,
  EI: 1,
  AST: 1,
  EX: 8000,
  P: 5010,
  MS: 1000,
  RP: 1,
  ET: 1,
  FV: 1,
  AD: 1,
  CM: 1,
  AN: 1,
  BN: 1,
  PL: 1,
  JTI: 1,
}

function readStored(): StoredMockState | null {
  if (!mockEnabled) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredMockState>
    if (parsed.version !== 34 || parsed.revision !== 1 || !parsed.runtime || !parsed.data) return null
    return parsed as StoredMockState
  } catch {
    return null
  }
}

const stored = readStored()
const runtime: MockRuntimeState = {
  nowMs: stored?.runtime.nowMs ?? DEFAULT_NOW_MS,
  networkMode: stored?.runtime.networkMode ?? 'normal',
  sequences: { ...DEFAULT_SEQUENCES, ...(stored?.runtime.sequences ?? {}) },
}

/**
 * Mock 模式使用可控业务时钟；真实 HTTP 模式必须跟随设备当前时间。
 * 页面层仍复用这些格式化函数，因此不能在 HTTP 模式返回演示基准时间。
 */
function effectiveNowMs(): number {
  return mockEnabled ? runtime.nowMs : Date.now()
}

let exportData: (() => unknown) | null = null
const persistenceError = ref('')
export const mockClockVersion = ref(0)

export function readStoredMockData<T>(): T | null {
  return (stored?.data as T | undefined) ?? null
}

export function registerMockStateExporter(exporter: () => unknown): void {
  exportData = exporter
}

/** data URL 可能超过 localStorage 配额；大文件仅保留本次会话预览，不写入快照。 */
function snapshotReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.replace(/data:[\w.+/-]+;base64,[a-zA-Z0-9+/=]+/g, (dataUrl) => dataUrl.length > 200_000 ? '' : dataUrl)
}

function stripInlineFiles(_key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.replace(/data:[\w.+/-]+;base64,[a-zA-Z0-9+/=]+/g, '')
}

export function commitMockState(): void {
  if (!mockEnabled || !exportData) return
  try {
    const state: StoredMockState = { version: 34, revision: 1, runtime, data: exportData() }
    const snapshot = JSON.stringify(state, snapshotReplacer)
    try {
      localStorage.setItem(STORAGE_KEY, snapshot)
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state, stripInlineFiles))
    }
    persistenceError.value = ''
  } catch (error) {
    persistenceError.value = error instanceof Error ? error.message : 'Mock 状态持久化失败'
  }
}

export function getPersistenceError(): string {
  return persistenceError.value
}

export function resetMockState(): void {
  if (!mockEnabled) return
  localStorage.removeItem('joinyuu_client_mock_v32')
  localStorage.removeItem('joinyuu_client_mock_v33')
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(SESSION_KEY)
}

export function mockNowMs(): number {
  return effectiveNowMs()
}

export function mockNowDate(): Date {
  return new Date(effectiveNowMs())
}

export function setMockNow(value: number): void {
  runtime.nowMs = value
  mockClockVersion.value += 1
  commitMockState()
}

export function advanceMockNow(minutes: number): void {
  setMockNow(runtime.nowMs + minutes * 60_000)
}

export function formatMockStamp(value = effectiveNowMs()): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatMockDate(value = effectiveNowMs()): string {
  return formatMockStamp(value).slice(0, 10)
}

export function parseMockStamp(value: string): Date {
  const [datePart = '', timePart = '00:00'] = value.trim().split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0)
}

export function nextMockId(prefix: string, width = 4): string {
  const current = runtime.sequences[prefix] ?? 1
  runtime.sequences[prefix] = current + 1
  return `${prefix}${String(current).padStart(width, '0')}`
}

export function getMockNetworkMode(): MockNetworkMode {
  return runtime.networkMode
}

export function setMockNetworkMode(mode: MockNetworkMode): void {
  runtime.networkMode = mode
  commitMockState()
}

export function getMockRuntimeState(): Readonly<MockRuntimeState> {
  return runtime
}

export const mockStorageKey = STORAGE_KEY
