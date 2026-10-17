# 版本与更新日志规范

> 适用对象：所有参与本项目发布的人（含 AI agent）。**每次版本更新都必须同时完成三件事**：提升版本号、写入三端 `CHANGELOG.md`、核对三端版本展示一致。
> 相关文档：[部署手册](./deploy-1panel.md)、[后端升级手册](./backend-upgrade.md)、[许可证管理](./license-management.md)。

---

## 1. 版本号规则

采用 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`，例如 `1.5.0`。

| 段位 | 何时递增（本项目语境） | 示例 |
| --- | --- | --- |
| **MAJOR** | 不兼容的破坏性变更：数据库迁移不可逆且需人工介入、接口契约不兼容、菜单/权限码大规模重构、部署方式变更 | `1.5.0 → 2.0.0` |
| **MINOR** | 向后兼容的功能新增：新增业务模块、新增页面/接口、新增可配置项、新增定时任务 | `1.5.0 → 1.6.0` |
| **PATCH** | 向后兼容的缺陷修复与体验优化：修 bug、文案/样式调整、性能优化、文档修正 | `1.5.0 → 1.5.1` |

补充约定：

- **三端锁步**：后端（apps/api）、管理后台（apps/admin）、移动端（apps/client-mobile）**始终使用同一版本号**，因为它们同属一套部署、共享同一数据库契约。若某次只改了一端，其它两端版本号也随之升到同一号（`CHANGELOG` 中注明"本次仅改动 X 端"）。
- **预发布**：需要灰度或试运行时使用 `1.6.0-rc.1` 形式（当前项目暂未启用）。
- **首个正式版**：`v1.5.0`（此前为 `0.1.0` 的内部开发期，不追溯编号）。

---

## 2. 版本号唯一来源（单源原则）

**只在 `package.json` 里写版本号，不得在代码里硬编码字符串。**

| 文件 | 作用 |
| --- | --- |
| `package.json`（仓库根） | 产品版本（与三端同号），供发布脚本与文档引用 |
| [apps/api/package.json](../apps/api/package.json) | 后端版本（运行时唯一来源） |
| [apps/admin/package.json](../apps/admin/package.json) | 管理后台版本（构建期唯一来源） |
| [apps/client-mobile/package.json](../apps/client-mobile/package.json) | 移动端版本（构建期唯一来源） |

取值方式（已实现，改动时不要绕过）：

| 端 | 读取方式 | 代码位置 |
| --- | --- | --- |
| 后端 | 运行时读取 `apps/api/package.json` 的 `version` | [src/common/version.ts](../apps/api/src/common/version.ts) → 由 `APP_VERSION` 常量导出 |
| 管理后台 | 构建期由 vite `define` 注入编译期常量 `__APP_VERSION__` | [vite.config.ts](../apps/admin/vite.config.ts) → [src/version.ts](../apps/admin/src/version.ts) 导出 `APP_VERSION` |
| 移动端 | 同上 | [vite.config.ts](../apps/client-mobile/vite.config.ts) → [src/version.ts](../apps/client-mobile/src/version.ts) 导出 `APP_VERSION` |

> 前端用 `typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'` 兜底，避免在未注入 `define` 的运行环境（单元测试等）抛 `ReferenceError`。

### 版本号对外可见位置

| 端 | 位置 | 数据来源 |
| --- | --- | --- |
| 后端 | `GET /api/health` → `data.version` | `APP_VERSION` |
| 后端 | `GET /api/app/config` → `data.version` | `APP_VERSION` |
| 后端 | 后台「系统管理 → 系统监控 → 概览」服务信息 | 监控服务读取同一 package.json |
| 管理后台 | 登录页品牌区 `v1.5.0`；「系统管理 → 关于 → 版本信息」（管理后台 + 服务端） | `APP_VERSION` + `/api/health` |
| 移动端 | 「我的 → 关于」（软件版本 / 服务端版本 / 定制UI版本号） | `APP_VERSION` + `/api/app/config` |

> 排查技巧：三处版本号不一致（例如关于页显示后台 `v1.5.0` 而服务端 `v1.4.0`）说明**前端产物与后端不是同一次发布**，按升级手册重新部署缺失的一端即可。

---

## 3. 更新日志规范

三端各一份，遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)：

- [apps/api/CHANGELOG.md](../apps/api/CHANGELOG.md)
- [apps/admin/CHANGELOG.md](../apps/admin/CHANGELOG.md)
- [apps/client-mobile/CHANGELOG.md](../apps/client-mobile/CHANGELOG.md)

### 文件结构

```markdown
# 更新日志 · <端名>
> 三端锁步发布，版本号唯一来源为 package.json 的 version；版本规则见 docs/versioning.md。

## [Unreleased]          ← 日常开发中的改动先写在这里

## [1.5.0] - 2026-10-17  ← 发布时把 Unreleased 内容整理到此处（版本号 + 日期）
### 新增
### 变更
### 修复
### 安全
```

### 分类（中文口径，对应 Keep a Changelog 的分类）

| 分类 | 写什么 | 对应提交类型 |
| --- | --- | --- |
| **新增** | 新功能、新接口、新页面、新配置项 | `feat` |
| **变更** | 既有行为的调整（含交互、术语、默认值、策略调整） | `feat` / `refactor` |
| **修复** | 缺陷修复 | `fix` |
| **安全** | 权限、凭据、限流、加密、审计相关 | `fix` / `feat` |
| **移除**（按需） | 删除的功能或入口 | `refactor` |

### 写法要求

1. **面向使用者的行为**，不堆内部实现细节：写"列表状态筛选改为勾选式"，不写"新增 CheckboxGroup 组件"。
2. **可追溯**：能对应到具体端（后端/后台/移动端）与模块域（如"活动""积分商城"）。
3. **不夸大、不遗漏**：破坏性变更、需要人工介入的迁移、需要新增环境变量的项**必须写明**。
4. **同一版本内合并同类项**，避免流水账；一条 bullet 覆盖一个可感知的变化。
5. **日期用发布日期**（北京时间 `YYYY-MM-DD`）。
6. 未发布的改动放 `## [Unreleased]`；发布时才新建版本段，**不要把 Unreleased 清空后丢失内容**。

---

## 4. 发布流程（每次版本更新照此执行）

| # | 步骤 | 具体动作 |
| --- | --- | --- |
| 1 | 完成开发与自测 | 功能提交；确认 lint / typecheck / 单测 / e2e 通过 |
| 2 | **提升版本号** | 同步修改 4 处：根 `package.json` 与三端 `package.json` 的 `version`（同号） |
| 3 | **写更新日志** | 把 `[Unreleased]` 的内容整理进新的 `## [x.y.z] - 日期` 段（三份 CHANGELOG 都要，未改动的一端注明"本次未改动"） |
| 4 | 同步文档 | 若涉及部署/配置变化：更新 [部署手册](./deploy-1panel.md) 与 [后端升级手册](./backend-upgrade.md)；若涉及接口契约：更新 [wiki-backend](./wiki-backend.md) |
| 5 | 提交与打标签 | 提交信息形如 `release: v1.5.1`（或按改动类型提交）；发布后打 `git tag v1.5.1` |
| 6 | 构建 | `pnpm build:api`、`pnpm build:admin`、`pnpm build:client-mobile` |
| 7 | 部署 | 按[升级手册](./backend-upgrade.md)执行：备份 → 迁移 → 替换产物 → 重启 |
| 8 | **发布后核对** | 打开三端「关于」页与 `/api/health`，确认版本号一致且等于本次发布的版本号 |

> 一句话纪律：**没有更新日志的版本不算发布**；三端 `CHANGELOG` 与 `package.json` 版本号必须同时改。

---

## 5. 与提交信息的关系

仓库提交信息采用 Conventional Commits 风格（见 [README](../README.md) 的贡献章节）：

```
<type>(<scope>): <描述>
```

- `type`：`feat` / `fix` / `refactor` / `perf` / `docs` / `test` / `chore` / `release`
- `scope`：涉及端与域，例如 `api,admin,mobile`、`api`、`admin`
- 更新日志即由提交信息汇总而来：**分类对应 type，描述对应提交标题**。因此提交标题应写清"用户可感知的变化"，便于直接整理进 CHANGELOG。

---

## 6. 发布检查表（可复制使用）

```markdown
- [ ] 三端 lint / typecheck / 单测 / e2e 通过
- [ ] 根与三端 package.json 版本号已提升为 x.y.z（同号）
- [ ] apps/api/CHANGELOG.md 已写入 [x.y.z] 段（含日期与分类）
- [ ] apps/admin/CHANGELOG.md 同上
- [ ] apps/client-mobile/CHANGELOG.md 同上
- [ ] 破坏性变更 / 新增环境变量 / 需人工介入的迁移已在 CHANGELOG 与升级手册中写明
- [ ] 三端构建成功（build:api / build:admin / build:client-mobile）
- [ ] 部署后核对：/api/health、后台关于页、移动端关于页版本号一致
- [ ] 已打 git tag vx.y.z
```
