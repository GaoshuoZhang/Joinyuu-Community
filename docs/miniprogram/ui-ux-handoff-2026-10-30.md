# 小程序 UI/UX 后续审查与交接 · 2026-10-30

本文供接手 agent 使用，正式审查历史见 [UI/UX 审查记录](ui-ux-audit-2026-10-30.md)。历史截图覆盖不等于当前版本验收；必须结合实际路由、账号权限和页面参数判断。

## 工作区与当前基线

- 根目录：`D:\Projects\Joinyuu-Community`。小程序：`apps/wxminiprogram`，移动 Web：`apps/client-mobile`；各自为独立 Git 仓。
- 三处 UI 审查分支已快进合并到各自 `main`：根仓 `5e37248`、移动 Web `781d6df`、小程序 `620f652`。这些是本轮新修复之前的基线；该轮结束时尚未推送，审查分支仍保留。
- UI 审查阶段保留了 API、后台及扫码登录文档的既有修改；后续用户明确要求全仓提交推送，现一并纳入本次交付。每次先运行 `node scripts/workspace.mjs status`。
- 必须阅读根仓与相关子仓 AGENTS/README、[小程序开发规范](development.md)。业务交互以移动 Web 为基线；核对后已一致的 Web 不做重复改动。
- 微信模拟器用于小程序取证；`http://192.168.31.101:7759/` 仅作为移动 Web 对照，不可用浏览器截图冒充小程序验收。

## 本轮优先任务

1. 文章详情顶部标签：`pkg/pages/article/detail.wxml/.less` 已增加 `head__tag` 容器，以 `align-self: flex-start` 阻止纵向 Flex 的横向拉伸。真实文章 `id=A1011` 已截图确认标签按内容宽度显示；标题继续正常换行。
2. 底栏“需求”图标：`custom-tab-bar/index.js` 已由 `list` 改为 `app`；现有 `ui-icon` 已含与 Web 同源的 TDesign `app` 路径，不需要新增图标或改动全局 `list`。Web 基线为 `src/views/mobile/AppShell.vue` 的 `/projects` 配置。
3. 企业代办 JSON 缺失告警：三个文件都已存在且 JSON 有效。运行时曾无法注册、导航失败或空白。依次清理项目文件列表缓存与编译缓存，刷新并等待编译完成后恢复；列表和注册表单正常，详情无参显示参数兜底。不要创建重复 JSON、改 AppID 或清除登录存储来处理。
4. 当前业务账号已登录，身份为个人用户和社区个体。78 路由首轮留存 121 张，加上带参、动态分页与交互补测，正式截图共 151 张，详见 [登录态证据清单](ui-ux-logged-evidence-2026-10-30.md)。登录状态应在下一次接手时重新核对，禁止将工具账号登录等同于业务账号登录。
5. 补修网页兜底页黑色原生导航栏：app.json 绑定 theme.json 的导航背景，网页页移除固定文字/下拉样式覆盖；已截图确认白底“网页”标题恢复。
6. 补修空间预约缺参死路：`pkg/space/reserve/index` 显式记录 invalidParams，错误操作指向空间列表；网络失败仍保留重试。

本轮源码已分别提交：API `471bdef`、后台 `84750bb`、移动 Web `307fded`、小程序 `7f8b14d`，提交说明均为中文。基线提交号不包含这些增量。临时计划文档与根目录调试脚本继续留在本地，不作为正式交付文件。

## 工具与恢复步骤

使用 `C:\Users\Gaoshuo\.codex\skills\wechatide-skill\SKILL.md` 和 `mobile-app-ui-design\SKILL.md`。已确认 wechatide skill 0.3.14、CLI 可用；此前 MCP 接口返回 Bad Request，CLI 成功。新会话按 skill 门禁检查，不读取或猜测 Token。

```powershell
wechatide -c Codex check_wechatide_status --skill-version 0.3.14
wechatide -c Codex automation_navigate --project D:/Projects/Joinyuu-Community/apps/wxminiprogram --action reLaunch --url /pkg/pages/article/detail?id=A1011
wechatide -c Codex simulator_screenshot --project D:/Projects/Joinyuu-Community/apps/wxminiprogram --wait 1 --path C:/Users/Gaoshuo/AppData/Local/Temp/article-check.jpg
```

项目文件列表失步时，下面操作保留业务 Storage，但会重建编译上下文；刷新返回成功仅代表已触发，需要等待重新编译，再核对路由、页面 data 与截图。

```powershell
wechatide -c Codex debug_clear_cache --project D:/Projects/Joinyuu-Community/apps/wxminiprogram --action cleanProjectFileListCache
wechatide -c Codex debug_clear_cache --project D:/Projects/Joinyuu-Community/apps/wxminiprogram --action cleanCompileCache
wechatide -c Codex simulator_refresh --project D:/Projects/Joinyuu-Community/apps/wxminiprogram
```

新增/修改 UI 前必须使用 TDesign MCP：`get-component-list` → `get-component-docs` → 需要样式时 `get-component-dom`；图标用 `search-icon`。小程序传 `miniprogram`，移动 Web 传 `mobile-vue`。本轮已查 Tag、Icon API/Tag DOM 及 `app` 图标名。禁止跨端照搬 API。

## 截图与脚本位置

所有图片均为本地临时文件，未加入 Git；转交其他电脑时，需自行复制目录，并按其中账号与业务资料限制传播。临时目录可能被系统清理。

| 资料 | 完整路径 / 用法 |
| --- | --- |
| 上一轮未登录取证 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-audit-full-20261030` |
| 上一轮脚本 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-audit-20261030.ps1` |
| 本轮登录取证 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-audit-logged-20261030` |
| 本轮脚本 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-audit-logged-20261030.ps1` |
| 文章标签修复 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-article-fixed.jpg` |
| 登录资料卡与底栏图标 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-login-check.jpg` |
| 企业代办首页恢复 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-agency-recompiled.jpg` |
| 企业注册表单恢复 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-agency-registration-fixed.jpg` |
| 企业注册详情缺参兜底 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-agency-detail-fixed.jpg` |
| 网页原生导航栏修复 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-webview-fixed.jpg` |
| 空间预约缺参出口 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-space-missing-fixed.jpg` |
| 动态分页滚动补测脚本 | `C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-adaptive-audit.ps1` |

上一轮最终清单为 `00.json` 至 `77.json`，共 78 路由、35 路由到达目标、43 路由跳登录、91 张清单内截图。目录有旧轮次残留 JPG，**以 JSON 的 screenshots 数组为准**，不要直接统计文件数。上一轮最终联系表为 `contact-final-01.jpg` 至 `contact-final-06.jpg`；其他 contact 文件可能为过期中间结果。

清单字段：`index` 是 app.json 主包和分包展开顺序；`target` 为目标路由，`actual` 为实际路由，`height` 为页面容器高度，`screenshots` 为截图路径，`error` 为工具失败。`NN-P.jpg` 的 P 对应每次 500 逻辑像素滚动；到达底部可能重叠。`NN-ready.jpg` 为等待稳定的辅助截图，不计正式截图数。本轮脚本增加截图后路由复核；仍需人工判断异步加载、内层 scroll-view 和动态内容是否完整。

本轮正式增量清单为 `detail-0.json` 至 `detail-8.json`、`long-0.json`、`long-1.json`、`interactions.json`。`long` 对站内信与积分流水每次滚动后重新测量高度，直到追加数据加载完成并到达真实底部；前者 10 张、后者 5 张。`diagnostics` 保存失败工具尝试，不作为通过证据。联系表为同目录 `review-01.jpg` 至 `review-13.jpg`。

当前 wechatide 的 `automation_page_action.callMethod` 曾返回“this.method is not a function”，部分自定义组件选择器返回“no such element”；页面实际坐标点击可用。不要把这两类工具适配失败当作业务处理函数缺失；本轮最终交互证据使用真实坐标点击及运行时状态核对。

截图必须放在项目之外，写进项目目录会触发热编译、重置页面。旧截图中有 365/375/393 等不同逻辑宽度，不能假定全部同一设备；本轮独立修复截图为 570×1270 物理像素，尺寸比较应以运行时 windowInfo 为准。

## 接下来如何验收

### 登录后逐页与长页面

- 从 5 个 Tab 开始，逐个检查入口、角标、筛选、标题、空态、错误重试及返回路径；“我的”必须滚到末段，不能只查资料卡。
- 逐页对照 app.json 的 78 路由。到达目标不等于正常内容通过；缺 ID 的详情只记“缺参兜底”。登录/注册页在已登录时的重定向按实际交互记录。
- 所有长页查看首屏、中段、末段，检查固定操作栏遮挡、末项安全区、换行、标签宽度、按钮主次、间距和圆角。企业注册四步需要真实交互进入，不用 setData 伪造通过校验。
- 表单检查必填就近提示、返回未保存保护、上传进行中锁定、键盘与焦点、清除按钮。不要提交真实申请、上传身份证明或创建付费订单来制造测试数据。
- 当前账号不是企业管理员；企业成员/企业编辑等身份受限页面需要相应账号与真实数据。无法覆盖的分支写清账号条件，不标通过。

### 带真实参数的详情与流程

- 从当前列表点击进入文章、需求、活动、商品、订单、申请和预约详情，记录参数来源。此前真实返回过 `A1011`、`SU1011`、`D4007`、`D4001`，但接手时必须重新核对是否仍存在及是否有权限。
- 企业代办当前记录列表为空，不能将缺参详情算作真实详情/材料预览通过。需用户提供对应测试记录或隔离测试环境后检查补件、进度、附件和撤回分支。
- 不直接打印网络完整 headers、JWT、证件资料；只记录脱敏路由、状态、错误摘要。

### 专项剩余边界

- 深色、窄屏、平板/宽屏、最大系统字号、横屏、软键盘、真机读屏与系统返回，需要按实际工具能力补测；历史轮次的机型检查不能代替新增页面的验证。
- 无参网页页黑色原生导航栏已定位并修复，见上方；实际业务域名的 web-view 加载、域名限制和真机失败回退仍需对应链接验证。
- 动效检查加载/弹层/按压/页面切换，核对减少动态效果设置；不要仅用静态截图宣称动画通过。
- 所有视觉新问题先复现、留截图、查 TDesign 文档，再做最小修复并回看相同页面和状态；跨端差异以真实 Web 代码和画面核对。

## 完成标准与交付

1. `npm test`、`npm run lint` 在小程序通过；实际微信开发者工具构建、路由与视觉验证通过。修改 Web 时执行其 typecheck、lint、test、build。
2. 每个发现记录“复现入口/账号与参数/截图路径/根因/修改文件/复验结果”，将未覆盖情况与已修复问题分开。
3. 更新根仓文档并运行 `node scripts/check-docs.mjs`。本轮两处 UI 校正使小程序与 Web 既有设计对齐，Web 无需重复改动。
4. 分仓提交，保留用户其他修改；未授权时不推送、不上传体验版、不发布。
