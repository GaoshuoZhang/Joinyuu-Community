# 小程序 UI/UX 审查记录 · 2026-10-30

本次以 ui-ux-pro-max 的可访问性、触控、布局、视觉与动效清单审查原生小程序，并以移动 Web 为行为基线。通过 TDesign MCP 分别查询 miniprogram/mobile-vue 的组件列表、Button、Search、Tag/CheckTag、Input、Popup、Tabs、Cell 文档与结构，另外查询小程序 Textarea/Empty。实际安装小程序组件库为 1.12.1，模板与 CSS 变量同时核对本仓依赖源码。

## 已修复问题

| 问题 | 修复与范围 | 移动 Web 对应 |
| --- | --- | --- |
| 密码可能明文显示 | 登录、注册、找回密码、安全弹层共 8 处 `password` 改为 `type="password"`；检查脚本阻止再次写错 | 既有 PasswordInput 已正确处理 |
| 外置标签没有传入真实控件 | 79 个 Input 传入 label，用外部类隐藏重复视觉标签，保留原生 input 的读屏名称 | 既有表单关联与 PasswordInput |
| 错误/空态操作样式失效 | page-state 的重试与出口改用 TDesign Button；内容判断统一使用归一化 errorText | 既有 EmptyBlock/Button |
| 三处搜索框由 Input 嵌套手写容器造成内距与清除区不一致 | 需求、商城、积分改用 Search，与社区/广场/全局搜索统一 | 既有 Search |
| 筛选标签过密且尺寸混杂 | 15 处 CheckTag 声明使用统一宿主与外部类，32px 高、胶囊圆角；滚动行补间距 | CheckTag 同步 32px 胶囊与文字规格 |
| 表单输入默认内距叠加，边缘与文字起点不齐 | 业务 Input 根节点统一背景、内距、44px 最小高度；认证输入沿用独立规格 | 原有主题输入体系 |
| 小号按钮、返回、关闭、加减、删除等命中区过小 | 按钮高度与常用图标操作抬到 44px；附件移除用伪元素扩大命中，不放大预览图 | 原有 44px 控件规范 |
| 可点 View 无反馈/语义 | 补 8 处按压反馈与 153 处操作语义，关闭/删除控件补明确名称 | 既有 pressable 指令与具名按钮 |
| 整卡缩放使文字与边缘跳动 | 两端改为 120ms 透明度按压反馈，保持布局稳定 | 同步修改 |
| 大卡片丢失基础布局 | 商品详情、积分规则、预约结果/详情等 5 处补 `card card-lg`，恢复底色、圆角、纵向间距 | 既有 m-card |
| 首页留白重复与额外滚动 | 区块由单一 gap 控制；内部 page 不再额外占 100vh，满屏底色由 app-root 承担 | 原有页面壳 |
| 字体、边距、圆角在平板随屏幕放大 | 600px 以上使用稳定布局令牌；内容、操作栏、底栏最大 640px；导航图标保持设计尺寸 | 原有 640px 应用壳 |
| 明暗辅助文字与语义标签不够清楚 | 按实际背景合成/校验至少 4.5:1；提示类不再用禁用色；品牌浅底文字单独计算，不改变品牌实色按钮 | 同步客户主题辅助文字与搜索提示校正 |
| 深色商品占位仍为固定浅蓝 | 默认封面渐变跟随 brand-light/bg-subtle | 原有主题占位 |
| 需求详情次操作位置分散 | 收藏与分享取消组件默认 flex 均分并聚拢右侧；收藏图标改语义色 | 原有右对齐次操作 |
| 长表单返回丢失内容 | 三类需求、投稿、资料、个人名片、企业名片、企业成员共 8 类编辑页添加保护；回填不算编辑，保存成功解除；取消返回继续保护 | 原有 useUnsavedGuard |
| 自动轮播无法暂停、低动态覆盖不全 | 两端默认静止、主动播放；小程序提供播放/暂停，离开首页停止；骨架与底栏跟随减少动态效果 | 同步轮播默认静止，保留原有低动态支持 |
| 底栏文字过小/颜色与图标不一致 | 字号改 12px 设计值，文字使用 nav-text/nav-active；安全区继续由底栏真实占位处理 | 原有带文字 TabBar |
| npm 构建后组件加载失败 | 新增 prepare:npm 修正生成目录中裸 tslib 导入；重复执行修改 0 文件；检查脚本检测遗漏 | 小程序构建特有 |

## 验证与边界

- 静态检查覆盖 75 个注册页面、公共组件、主题与样式；测试覆盖密码属性/标签规则、明暗文字对比、未保存内容的编辑/还原/失败/取消/确认/保存与原有未读数隔离。
- 微信开发者工具按全部注册路径执行导航与首屏截图，查看七张联系表；缺业务参数的详情检查错误/空态，不将它算作正常详情验收。编辑源码期间的热更新会回首页，此类截图也不算目标页面通过。
- 通过真实列表与已返回 ID 补查需求、商品、空间预约正常内容，并检查密码弹层与编辑页。操作仅浏览与临时输入，不提交业务表单、不创建订单或执行支付。
- 机型包括原始 HUAWEI Pura 80 Pro（365px）、iPhone 12/13 mini（375px）、iPad mini 6/7（744px），另检查系统深色模式。宽屏令牌修复后重新查看平板；npm 产物路径修复后重新查看真实组件。
- 小程序 npm test / lint、开发者工具 npm 构建与模板编译；移动 Web typecheck / lint / test / build。最终执行结果与关联提交见下方记录。
- 当前工具不支持旋转与最大系统字号切换：未把横屏、最大字号、真机 VoiceOver/TalkBack、软键盘顶起和系统侧滑返回标为已通过。原生 enableAlertBeforeUnload 不拦截侧滑；自定义返回另有确认。平台能力依据见 [腾讯官方交互 API 说明](https://intl.cloud.tencent.com/ind/document/product/1219/57758)。
- 受当前账号身份/数据限制，企业管理特权、各类付款/退款分支与成功提交后的所有结果组合不能仅凭无参数截图确认；保留原状态机，未伪造真实业务数据。需带对应隔离账号、订单/企业参数继续真机验收。
- 原始截图含测试站点与账号内容，保存在本机临时审查目录，不纳入 Git。

## 注册页面清单

下表是代码/导航覆盖清单；“参数页”表示正常内容依赖真实业务参数，缺参截图只验证兜底。

| 路径 | 审查范围 |
| --- | --- |
| `pages/home/index` | 代码与默认入口画面 |
| `pages/projects/index` | 代码与默认入口画面 |
| `pages/community/index` | 代码与默认入口画面 |
| `pages/plaza/index` | 代码与默认入口画面 |
| `pages/me/index` | 代码与默认入口画面 |
| `pages/auth/forgot-password` | 代码与默认入口画面 |
| `pages/auth/login` | 代码与默认入口画面 |
| `pages/auth/register` | 代码与默认入口画面 |
| `pages/search/index` | 代码与默认入口画面 |
| `pages/webview/index` | 代码与默认入口画面 |
| `pkg/application/cooperation` | 代码与默认入口画面 |
| `pkg/application/individual` | 代码与默认入口画面 |
| `pkg/application/settle` | 代码与默认入口画面 |
| `pkg/checkout/confirm/index` | 代码与默认入口画面 |
| `pkg/checkout/index/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/checkout/result/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/demand/coop-form/index` | 代码与默认入口画面 |
| `pkg/demand/detail/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/demand/hub/index` | 代码与默认入口画面 |
| `pkg/demand/invest-form/index` | 代码与默认入口画面 |
| `pkg/demand/mine/index` | 代码与默认入口画面 |
| `pkg/demand/my-responses/index` | 代码与默认入口画面 |
| `pkg/demand/task-form/index` | 代码与默认入口画面 |
| `pkg/event/checkin` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/event/detail` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/intro/cooperation` | 代码与默认入口画面 |
| `pkg/intro/enterprise` | 代码与默认入口画面 |
| `pkg/intro/settle` | 代码与默认入口画面 |
| `pkg/intro/talent` | 代码与默认入口画面 |
| `pkg/mall/detail/index` | 代码与默认入口画面 |
| `pkg/mall/index/index` | 代码与默认入口画面 |
| `pkg/mall/order-detail/index` | 代码与默认入口画面 |
| `pkg/mall/rules/index` | 代码与默认入口画面 |
| `pkg/pages/article/detail` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/article/mine` | 代码与默认入口画面 |
| `pkg/pages/article/my-detail` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/article/new` | 代码与默认入口画面 |
| `pkg/pages/community/enterprise-showcase` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/community/talent-card` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/about/index` | 代码与默认入口画面 |
| `pkg/pages/me/application-detail/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/applications/index` | 代码与默认入口画面 |
| `pkg/pages/me/enrollments/index` | 代码与默认入口画面 |
| `pkg/pages/me/enterprise-detail/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/enterprise-edit/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/enterprise-member/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/experience` | 代码与默认入口画面 |
| `pkg/pages/me/favorites/index` | 代码与默认入口画面 |
| `pkg/pages/me/history/index` | 代码与默认入口画面 |
| `pkg/pages/me/identities` | 代码与默认入口画面 |
| `pkg/pages/me/identity-guide` | 代码与默认入口画面 |
| `pkg/pages/me/individual-card` | 代码与默认入口画面 |
| `pkg/pages/me/invitation/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/leases/index` | 代码与默认入口画面 |
| `pkg/pages/me/messages/index` | 代码与默认入口画面 |
| `pkg/pages/me/notices/index` | 代码与默认入口画面 |
| `pkg/pages/me/notification-settings/index` | 代码与默认入口画面 |
| `pkg/pages/me/points` | 代码与默认入口画面 |
| `pkg/pages/me/privacy/index` | 代码与默认入口画面 |
| `pkg/pages/me/profile` | 代码与默认入口画面 |
| `pkg/pages/me/project-detail/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/pages/me/projects/index` | 代码与默认入口画面 |
| `pkg/pages/me/realname` | 代码与默认入口画面 |
| `pkg/pages/me/records/index` | 代码与默认入口画面 |
| `pkg/pages/me/security/index` | 代码与默认入口画面 |
| `pkg/pages/me/stats/index` | 代码与默认入口画面 |
| `pkg/space/index/index` | 代码与默认入口画面 |
| `pkg/space/reservation-detail/index` | 代码与默认入口画面 |
| `pkg/space/reservations/index` | 代码与默认入口画面 |
| `pkg/space/reserve/index` | 代码与默认入口画面 |
| `pkg/trade/bills/index` | 代码与默认入口画面 |
| `pkg/trade/orders/index` | 代码与默认入口画面 |
| `pkg/trade/refund-apply/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/trade/refund-progress/index` | 代码与参数页兜底；正常内容按可用数据补查 |
| `pkg/trade/transaction-detail/index` | 代码与参数页兜底；正常内容按可用数据补查 |

## 关联记录

### 圆角专项复查（2026-10-30）

逐项检索小程序页面、分包、自建组件、公共样式及底栏的 227 处 `border-radius` 声明，另核对全局 TDesign 变量桥接和移动 Web 的对应表单、主题与页签。普通卡片、控件、紧凑标签、圆形和胶囊各有用途，头像的 `50%`、搜索/筛选胶囊及列表直角复位保留。

- 小程序此前忽略客户 `tokens.radius`，现在与移动 Web 的三档配置一致：small 卡片/控件为 4/4px，medium 为 8/8px，large 为 16/12px（手机以 375px 设计宽度折算 rpx，宽屏用 px）。未配置时保留各端现有默认值，非法配置不输出圆角覆盖。
- 卡片与普通控件分别使用圆角令牌；多行输入通过 TDesign 外部类统一控件圆角。移动 Web 的输入、多行输入和日期/选择触发器改用控件档，避免同一表单混入卡片档。
- 修正小程序 `--td-radius-extra` 为文档中的 `--td-radius-extraLarge`，明确 Popup、Dialog、Upload、Image 和方形 Tag 的变量；两端 MCP 按各自 framework 查询 API、DOM 与 CSS 变量。
- 广场与我的项目分段按钮按“外圆角减 4px 内距”取得内圆角。模拟器中 CSS 数学表达式未得到预期画面，改用主题生成的非负数值令牌，并复查手机画面。
- 活动封面的出血宽度和负边距改用与父卡片一致的间距令牌，显式只设置顶部两个圆角；页签指示线、角标、复选框与认证状态块去除零散硬编码。
- 移动 Web 顶部页签的圆角与裁切从 `100dvh` 支持条件中移出，旧 WebView 也应用圆角规则。

验证：小程序 npm test 10/10、lint；移动 Web typecheck、lint、build 通过，完整测试 154 项通过。微信开发者工具复查手机浅色的三档表单与最终分段按钮、平板暗色的表单/分段按钮/政策弹层，以及活动详情。测试主题仅临时修改页面展示，未改客户配置、未提交业务表单；模拟器已恢复手机浅色。当前可用活动无封面图，封面几何修复完成代码核对，尚缺真实封面画面的复核。自动化曾在切换机型后导航超时，稳定后重试成功；刷新后导航可能被重编译回首页覆盖，均重新确认实际页面后取证。

两端分别提交；本记录及两份 Unreleased 日志共同关联本次 UI/UX 修复。未发布版本、未上传体验版。

| 仓库 | 分支 | 提交 | 检查 |
| --- | --- | --- | --- |
| 微信小程序 | `codex/ui-ux-audit` | `0301083` | npm test 9/9、lint；75 个页面模板工具检查成功（两处瞬时失败重查成功）；npm 构建后执行 prepare:npm 并复查画面 |
| 移动 Web | `codex/ui-ux-audit` | `adfea97` | typecheck、lint、49 个测试文件 / 153 项测试、build |
| 微信小程序圆角专项 | `codex/ui-ux-audit` | `32b5082` | npm test 10/10、lint；19 处修改模板的 compile_wxml 摘要均成功；手机/平板与明暗画面复查 |
| 移动 Web 圆角专项 | `codex/ui-ux-audit` | `01c9aaf` | typecheck、lint、49 个测试文件 / 154 项测试、build |

`compile_wxss` 只接受磁盘上的 `.wxss`，本仓使用开发者工具 Less 插件，不能把该工具对 `.less` 的拒绝视为样式编译通过或失败；样式以插件编译后模拟器的实际画面核验。文档链接检查通过。
