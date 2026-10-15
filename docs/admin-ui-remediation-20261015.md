# 后台 UI/UX 整改记录

日期：2026-10-15。范围：本次审查确认的问题及整改中发现的相关回归问题。按数据正确性、操作可靠性、交互与视觉一致性的顺序实施。

基础控件继续使用 TDesign Vue Next（当前锁定安装版本 1.20.7）；保留已有 wangEditor 富文本能力。本轮修改保留在工作区，未提交、未执行生产部署，未运行数据库迁移或重置。

## P1：数据正确性与操作可靠性

| 问题 | 整改结果 | 主要代码位置 |
| --- | --- | --- |
| 新增消息渠道可能覆盖已有同类渠道 | 新增与按 ID 编辑分开；重复新增返回冲突；旧入口保留为只创建语义 | `apps/admin/src/api/messageChannels.ts`、`apps/api/src/modules/messaging/message-channel.service.ts` |
| 修改联系人、占比、标签、里程碑或可见范围后直接关闭可能丢失输入 | 将完整提交状态纳入未保存判断；提交期间阻止重复关闭；空富文本规范化，避免未编辑也要求放弃修改 | `components/ProjectFormDialog.vue`、`components/EventFormDialog.vue`、`utils/formSnapshot.ts` 等 |
| 多个自定义项目承接方共用空 ID，联系人串位 | 自定义承接方按可逆名称 key 独立存储；保留原始联系人和已有占比 | `utils/projectUndertakers.ts`、`components/ProjectFormDialog.vue` |
| 需求方选项慢或失败时，编辑保存可能清空已有主体身份 | 保留现有需求方快照并加入回显候选；无法解析的新主体阻止提交 | `utils/projectDemander.ts`、`components/ProjectFormDialog.vue` |
| 异步选项返回后覆盖已经输入的租约或平面图内容 | 打开时同步回填，选项独立加载；迟到选项不再次初始化表单 | `components/LeaseFormDialog.vue`、`components/AreaPlanDialog.vue` |
| 快速切换查询时，较早请求覆盖较新结果 | 给相关列表增加请求序号校验，仅接收最新请求结果 | `views/system/ArchivePanel.vue`、`views/system/MessageOutboxPanel.vue` 等 |
| 一键归档只处理前 2000 条，边归档边翻页可能漏项 | 固定确认时的筛选范围；分页收集完整 ID 后再执行；重复页/空页异常中止；支持取消、进度与部分失败计数 | `utils/bulkOperation.ts`、`components/BulkArchiveDialog.vue`，以及项目、活动、需求、预约、订单、投稿、申请、留言、租约列表 |
| 预约派生状态先分页后筛选，数量和分页不一致 | 服务端先按待使用/使用中/已结束构造筛选，再进行分页与计数 | `apps/api/src/modules/spaces/spaces.service.ts`、`views/spaces/ReservationPanel.vue` |
| 阅读统计只汇总有限条数，无法代表全量文章 | 新增服务端聚合与分页接口；汇总卡片和明细使用相同范围 | `apps/api/src/modules/contents/contents.service.ts`、`views/contents/ReadStatsPanel.vue` |
| 模板预览显示旧的已发布内容 | 预览直接渲染当前未保存草稿及其变量白名单，不写库；测试发送明确使用已保存的发布版本 | `views/system/MessageTemplatePanel.vue`、`apps/api/src/modules/messaging/message-template.service.ts` |
| 部分保存失败却提示全部成功 | 系统配置、企业成员与办公位状态分别处理结果，准确告知未成功部分并保留可恢复状态 | `views/system/SystemConfigPanel.vue`、`components/ExternalEnterpriseFormDialog.vue`、`components/WorkstationFormDialog.vue` |
| 无效活动日期、反向起止时间、报名截止不一致 | 表单与服务端同时校验；已发布活动通过改期入口调整起止时间；改期同步校验现有报名截止 | `components/EventFormDialog.vue`、`apps/api/src/modules/events/event-time.ts` |
| 月底续租跳到下一月份 | 按自然月/年增加租期并截断到目标月份最后一天，覆盖闰年 | `utils/calendar.ts`、`components/LeaseRenewDialog.vue` |
| 查看用户或管理员时附带请求其他权限域导致页面失败 | 用户相关企业 ID 从用户接口提供；流水独立权限和错误状态；管理员使用专用角色选项接口 | `views/users/UserDetailView.vue`、`views/system/AdminPanel.vue`、对应 API |
| 同名合作企业档案可能混淆成员归属 | 创建前拒绝重复有效名称；历史同名档案不再任意取第一条跳转 | `apps/api/src/modules/external-enterprises/external-enterprises.service.ts`、`modules/users/user.mapper.ts` |
| 折叠菜单改变 TDesign 根节点，权限指令失效并产生 Vue 警告 | 40 个菜单项改为渲染前权限判断；保留分组数据范围限制与后端鉴权 | `layouts/AdminLayout.vue` |

表中未带 `apps/admin/src/` 前缀的前端路径均相对于该目录。

## P2：交互、可访问性与组件一致性

- 顶部页面标签使用 TDesign Tabs，保留完整查询地址、关闭当前页签后的相邻页签选择、工作台常驻和未保存离开保护。
- 侧栏入口使用 TDesign Menu 的路由模式，修复申请表单配置、注销工单两处条件菜单遗漏的路由参数。
- 集中补齐当前 TDesign 版本中 Switch、Tabs、Dialog 的键盘和语义缺口：Space/Enter、方向键、Home/End、Delete 关闭页签、模态焦点闭环、嵌套确认框与关闭后的焦点恢复。
- 工具栏、弹窗和输入字段补充名称与错误定位；等级配置表、ZIP 上传、素材替换确认等入口使用 TDesign Table、Upload、Dialog。
- 相关表单的行业、用户及成员选项独立提供加载、失败与重试状态；选项异常不再让主列表整体失效。
- 当前在线会话明确标记；退出当前会话与下线其他会话的反馈和跳转分别处理。
- 移动端部署地址统一校验 HTTP/HTTPS、主机端口及子路径，拒绝凭据、查询参数和片段；纠正输入后清除旧错误。
- 富文本不再自动抢焦点；真实可编辑区覆盖 360px 留白；工具栏提供可访问名称；关闭时取消 wangEditor 尚未执行的 selectionchange 尾调用。

`utils/tdesignAccessibility.ts` 与富文本销毁兼容逻辑均针对当前安装版本核对。升级依赖时需要重新验证这些适配行为。

## P3：信息组织与布局

- 系统配置拆成 6 张 TDesign Card，用“日常运营 / 技术服务”组织内容，保留同一次保存、未保存保护和吸底保存栏。
- 主要业务宽表固定名称与操作列，页面底部提供横向滚动入口；375px 等窄屏取消两侧固定，防止互相遮挡。
- 用户名片补充字段展示与分段信息，采用 TDesign Collapse 和 Descriptions。
- 系统监控补充刷新与采样时间，调整响应式断点和辅助文字对比；统计卡支持再次点击取消筛选。
- 统一主要查询操作的层级，修正日期查询触发、按钮图标对齐及与现状不符的注释。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @joinyuu/admin test:ui` | 27/27 通过，包含真实 TDesign DOM 与嵌套弹窗测试 |
| `pnpm --filter @joinyuu/api test:unit --runInBand` | 15 个测试集、114/114 通过 |
| Admin / API TypeScript 检查 | 通过 |
| `pnpm lint` | 通过，0 warning |
| `pnpm build:admin` / `pnpm build:api` | 通过 |
| `git diff --check` | 通过 |

浏览器验证分为两部分：

1. **隔离组件回归**：实际后台源组件与 TDesign，全部业务 API 替换为内存实现。验证项目两组联系人、60/40 占比、未返回选项时需求方身份保留、租约延迟选项不覆盖输入、未保存确认、系统配置字段错误、Switch 键盘、Tabs 方向键与关闭焦点、批量统计取消、富文本关闭重开、桌面 1440×900 和窄屏 375×812 布局。受限权限切换后，展开时只渲染工作台与项目入口；折叠及切回全部权限后没有新的 Vue 警告或控制台错误。
2. **原业务环境只读冒烟**：工作台、项目列表及编辑回填、预约状态切换、阅读汇总与明细、管理员角色列表、当前会话标记、系统配置、消息渠道及模板列表均正常加载。本轮检查未产生新的控制台 error。结束时已返回工作台并清理本轮临时页签。

隔离夹具可复现运行：

```powershell
node apps/admin/test/fixtures/remediation/serve.mjs
```

浏览器打开 `http://127.0.0.1:17760/test/fixtures/remediation/index.html`。该服务仅监听本机，不配置业务代理。仅项目权限/全部权限按钮只影响夹具中的模拟身份。

截图使用内存测试数据，保存于 `apps/admin/test/artifacts/ui-remediation-20261015/`：

- `system-config-desktop.jpg`：配置分组、表单和保存栏。
- `project-mobile.jpg`：375px 窄屏项目表单。
- `restricted-menu.jpg`：受限权限折叠菜单。

## 验证边界与交付注意

- 未在业务环境执行保存、删除、批量归档、强制下线、测试发送、素材上传或许可证导入。写操作可靠性以隔离浏览器和单元测试为证据，尚未进行新版本完整业务写入 E2E。
- 未运行仓库已有的 `authenticatedE2e.mjs`，未将已有 E2E 报告的通过项计入本轮结果。
- 合作企业重名防护为服务层检查；当前没有新增数据库唯一约束，极端并发创建不具备数据库级唯一性保证。历史重名数据未自动合并。
- 新增的角色选项、阅读统计与渠道创建/编辑接口需要前后端配套发布。生产环境发布和数据库数据治理不在本轮执行范围。
- 已验证的测试和场景通过，不代表所有角色、数据规模、设备与第三方服务组合均无缺陷。
