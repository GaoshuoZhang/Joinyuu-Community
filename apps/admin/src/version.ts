/* 后台版本号：构建期由 vite define 注入的编译期常量（来源 apps/admin/package.json 的 version）。
 * 与后端、移动端锁步发布，版本规则与发布流程见 docs/versioning.md。
 * 用 typeof 兜底：单元测试等未注入 define 的运行环境下不会抛 ReferenceError。 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
