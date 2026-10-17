/* 服务端版本号唯一来源：apps/api/package.json 的 version。
 * 三端锁步发布（后端 / 管理后台 / 移动端共用同一版本号），版本规则与发布流程见 docs/versioning.md。
 * 用 require 而非静态 import：相对路径在 src（src/common → apps/api）与 dist（dist/common → apps/api）
 * 两种运行形态下都成立，且不会让 tsc 把 package.json 纳入编译而改变 dist 输出结构。 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const APP_VERSION: string = (require('../../package.json') as { version: string }).version
