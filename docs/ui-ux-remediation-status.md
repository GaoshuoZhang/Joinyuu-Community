# UI/UX 五项整改验收记录

日期：2026-09-12。范围：管理后台 URL 状态、TDesign 链接、placeholder、敏感配置自动填充和列表错误恢复。

## 实现与覆盖

| 要求 | 实现 | 覆盖 |
| --- | --- | --- |
| 列表 URL 状态 | `src/utils/listQuery.ts` | 19 个 query 对象列表 + 管理员、素材库、字典、租赁、办公室、办公位，共 25 页 |
| 模拟链接 | TDesign Link + 真实 href | 工作台、侧栏 Logo、顶部页签、通知、身份卡、企业统计、需求主体、项目承接方、租赁方、办公位关联主体 |
| placeholder | 静态文案统一使用中文省略号；动态办公位/字典提示同步 | views 与 components；自动检查静态属性 |
| 敏感配置 | `autocomplete="off"` | MinIO AccessKey、SecretKey |
| 持久错误态 | `ListErrorState.vue`：TDesign Alert、错误原因、可重试按钮、加载时禁用 | 36 个独立列表/规则/监控加载入口，另含通知列表和监控执行日志 |

没有筛选、排序或分页状态的只读列表（例如积分发放记录、阅读统计）保持固定 URL，加入同一错误恢复组件；不人为添加无业务意义的 query 参数。

## URL 状态约定

- 服务端列表在查询、重置、翻页、排序触发实际加载时同步 URL；输入关键词本身不触发请求。
- 前端 computed 筛选列表使用 live 模式，实时同步可见状态。
- setup 阶段恢复状态，保留页面原有首次加载；同步自身 URL 不再次请求。
- 外部 query 变化及前进后退恢复状态；删除参数恢复默认值。
- 分页参数校验为正整数，pageSize 上限 100；非法值回退默认值。
- 日志聚合页用 `audit.*` / `login.*` 隔离，管理员列表使用 `admins.*`，保留父级 `tab`。
- 原有需求深链接 `publisher` 与内部 `publisherId` 保持兼容。
- 保留排序、日期范围、主体筛选和归档域；已离开的页面不得写入新路由。

## 验证

命令：

```sh
pnpm --filter @joinyuu/admin test:ui
pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit
pnpm --filter @joinyuu/admin lint
pnpm build:admin
git diff --check
```

- 6 个 Vue + Vue Router 内存路由行为测试：类型恢复、提交/重置、前进后退、非法分页、页签隔离、ref/旧参数别名和离开路由。
- 真实 TDesign Alert/Button 的服务端渲染测试：错误文案、alert 语义、重试按钮及 loading 禁用。
- 3 个全量源码契约检查：36 个加载入口的 catch 与模板内重试、19 个 query 列表 setup 接入、placeholder 与敏感配置属性。
- TypeScript 检查不等于完整 Vue 模板类型检查；Vite 构建补充模板编译验证。
- 本记录的渲染验证为服务端组件渲染，不代表全页面浏览器视觉回归，也不包含后端 e2e。

测试使用 Node 22.18+ 的 TypeScript 类型擦除能力；当前验证环境为 Node 24。
