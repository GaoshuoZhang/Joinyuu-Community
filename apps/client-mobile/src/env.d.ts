/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 绑定模式：mock（默认）| http */
  readonly VITE_API_MODE?: 'mock' | 'http'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
