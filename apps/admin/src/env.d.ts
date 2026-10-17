/// <reference types="vite/client" />

/** 构建期注入的应用版本号（来源 apps/admin/package.json，见 vite.config.ts 与 docs/versioning.md） */
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
