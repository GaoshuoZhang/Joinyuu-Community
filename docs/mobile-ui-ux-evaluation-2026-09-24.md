# 聚屿社区移动端 UI/UX 评估报告

评估日期：2026-09-24  
评估对象：`apps/client-mobile/`，已打开的本地客户端 `http://localhost:7759/`（与用户给出的局域网地址对应同一应用）  
测试设备参数：iPhone 15 Pro 的 393 × 852 CSS 像素视口、3 倍像素比、触控模拟及 iPhone 浏览器标识。此为浏览器设备模拟，不能替代实体 iPhone 上的 Safari、系统键盘和安全区验收。  
测试账号：已登录社区企业兼社区个体用户。测试中提交了活动 EV6011 的报名，并将深色模式恢复为原有浅色；未修改客户端代码。

## 评估范围与总体判断

通过点击、滑动、搜索输入、空表单提交和状态切换，覆盖首页、全局搜索、需求列表/详情/发布、社区服务/人才库/企业库、广场活动/资讯、活动报名/签到、个人资料、我的记录/预约/订单、空间预约、积分商城、站内信与设置。随后核对了 Vue 页面、共享组件与全局样式，并查询 TDesign Mobile Vue 组件文档。

现有界面已具备统一的蓝色主色、卡片基础样式、固定底部导航、44px 按钮高度、部分表单的行内校验及加载反馈。主要风险集中在**操作结果可信度**（通知入口、预约状态、日期取消）、**信息可读性**（窄卡、辅助文案、深色模式）和**商业化内容呈现**（空资料与联调数据）。当前交互未见持续卡死；响应速度没有在实体网络和设备上计时，因此不作毫秒级性能结论。

严重程度：高＝可能造成错误操作或关键任务无法完成；中＝明显增加理解/操作成本；低＝局部视觉一致性问题。以下编号按修复优先级排列。所有组件建议均基于 TDesign MCP 查询到的 `mobile-vue` API，沿用项目已有组件。

## 问题清单

### UX-01｜站内信：数据导出通知缺少明确的操作反馈｜中｜UX 体验

- **现象与证据**：`/notices` 的“个人数据导出已生成，点击查看或下载”卡片被点击后，未读数从 7 变为 6，但页面没有可见的下载开始或完成提示。浏览器模拟环境不能据此断定文件没有下载。
- **代码定位**：[NoticesView.vue](../apps/client-mobile/src/views/mobile/NoticesView.vue#L50) 在通知缺少 `link` 时仅执行标记已读；`n.link` 为导出 API 路径时调用下载，但成功分支没有反馈。[me.ts](../apps/client-mobile/src/api/me.ts#L70) 通过临时链接触发浏览器下载。
- **改进方案**：通知数据生成时保证导出消息带有效 `link`；渲染时按可执行目标显示“下载文件”或“查看详情”，缺少目标时改为纯信息卡，并提供“前往个人数据管理”的可用入口。保留现有 TDesign `Cell`，下载成功触发后用现有 `Toast` 告知“已开始下载”，失败则显示原因。
- **预期效果**：用户能判断点击结果，减少“只变已读但不知文件去向”的困惑。

### UX-02｜需求发布：取消日期选择后仍提示未保存修改｜高｜UX 体验

- **现象与证据**：在“找服务”表单中只尝试空表单校验、打开并取消日期面板，返回时出现“当前修改尚未保存”。本轮没有输入需求内容。
- **代码定位**：[DemandKindExtras.vue](../apps/client-mobile/src/components/forms/DemandKindExtras.vue#L67) 将 TDesign `DateTimePicker` 直接 `v-model` 到 `deliverBy`，`cancel` 仅关闭 `Popup`；[DemandFormView.vue](../apps/client-mobile/src/components/forms/DemandFormView.vue#L105) 用表单快照判断脏状态。按 TDesign 文档，选择器 `change/pick` 与 `confirm/cancel` 是不同事件。
- **改进方案**：面板打开时使用临时日期值；仅在 `confirm(value)` 写回 `deliverBy`，`cancel` 丢弃临时值。对 `SpaceReserveView.vue` 中直接绑定 `date` 的同类用法一并检查。保持现有 TDesign `Popup` + `DateTimePicker`，不引入新组件。
- **预期效果**：取消真正撤销选择，离开提示只在有有效修改时出现。

### UX-03｜空间预约：当天已过去的时段仍可选｜高｜UX 体验

- **现象与证据**：`/spaces/S1002/reserve` 默认显示评估当天 2026-09-24；09:00 时段处于可点状态，点击后成为开始时间。当前测试发生在当日下午。最终提交是否由服务端拦截未验证，因此这里指**前端选择阶段的误导**。
- **代码定位**：[SpaceReserveView.vue](../apps/client-mobile/src/views/mobile/SpaceReserveView.vue#L180) 的 `endpointDisabled` 只依据空间占用与区间规则，未结合 `businessNowMs` 排除已过去的时段。
- **改进方案**：同日时将早于当前业务时间的起始时段禁用，并在时段区说明“已过时段不可预约”；仍由后端在提交时复核。沿用 TDesign `CheckTag` 的 `disabled` 状态，并保留可用/占用/已过三种清晰文案或图例。
- **预期效果**：用户在选择阶段即可理解可预约范围，减少提交失败。

### UX-04｜全局搜索：新关键词加载时保留旧结果与数量｜中｜UX 体验

- **现象与证据**：从“路演”改搜无结果词时，“搜索中…”下方仍显示“路演”的 7 条分类数量和结果卡片，直到请求完成才替换为空态。
- **代码定位**：[GlobalSearchView.vue](../apps/client-mobile/src/views/mobile/GlobalSearchView.vue#L172) 明确在后续搜索期间保留 `results` 并继续渲染；搜索函数开始时没有区分“当前关键词的结果”与“上一关键词的结果”。
- **改进方案**：加载新词时将旧结果整体置于明显的“上次结果”区或暂时隐藏，仅显示 TDesign `Loading`/既有骨架；请求完成后原子切换结果和分类数量。保留代码已有的请求序号防竞态逻辑。
- **预期效果**：搜索结果与输入词始终对应，避免点击到过期内容。

### UX-05｜活动详情：报名截止时间显示“—”｜中｜UX 体验

- **现象与证据**：EV6011 活动详情显示“报名截止：—”，同时底部允许“立即报名”。用户无法判断截止规则。
- **代码定位**：[EventDetailView.vue](../apps/client-mobile/src/views/mobile/EventDetailView.vue#L257) 无条件格式化 `event.enrollmentDeadline`；[format.ts](../apps/client-mobile/src/utils/format.ts#L31) 对无效日期返回 `—`。
- **改进方案**：先明确产品规则：若无截止时间，显示“报名截止：活动开始前”或“报名截止时间未设置”，并与服务端可报名条件一致；若字段必填，则从活动配置侧修正数据并在发布前阻止缺失。避免直接把格式化占位符暴露在业务文案中。
- **预期效果**：活动规则清楚，减少报名时的犹豫与误解。

### UX-06｜活动报名：立即报名直接提交，缺少信息确认｜中｜UX 体验

- **现象与证据**：EV6011 点击“立即报名”后立即进入“报名已提交”结果页，没有确认姓名、活动时间或待审核条件的最后一步。预约与退款流程已有确认对话框，核心操作模式不一致。
- **代码定位**：[EventDetailView.vue](../apps/client-mobile/src/views/mobile/EventDetailView.vue#L151) 直接调用 `enrollEvent`；[EventEnrollmentActions.vue](../apps/client-mobile/src/components/events/EventEnrollmentActions.vue#L66) 将按钮事件直接上抛。
- **改进方案**：首次报名使用项目已有 TDesign `DialogPlugin.confirm` 模式，显示活动名、时间、地点、审核与候补规则；同页重复报名/取消维持明确的状态文案。确认按钮写“确认报名”，取消按钮写“返回查看”。
- **预期效果**：减少误触报名，统一关键操作的预期。

### UX-07｜预约详情：已通过状态与处理进度不一致｜中｜UX 体验

- **现象与证据**：SR2015 顶部显示“已通过”，但“处理进度”只有“提交预约”一条，缺少通过时间与处理结果。
- **代码定位**：[MyReservationDetailView.vue](../apps/client-mobile/src/views/mobile/MyReservationDetailView.vue#L71) 直接逐条展示 `reservation.records`，没有检查当前状态是否存在相应节点。需进一步核对接口事件数据。
- **改进方案**：服务端补齐审核/自动通过事件；前端在事件缺失时至少提供“已通过，处理时间暂无”的当前状态摘要，不伪造时间。时间线保持现有列表结构，状态色沿用共享 `StateTag`。
- **预期效果**：状态可追溯，用户能确认预约何时生效。

### UI-08｜资料编辑：性别“保密”在单选行中断行为两行｜中｜UI 设计

- **现象与证据**：`/me/profile/edit` 的“保密”被挤成两行，而同一行右侧有可用空间，三个选项视觉重心失衡。
- **代码定位**：[ProfileEditView.vue](../apps/client-mobile/src/views/mobile/ProfileEditView.vue#L181) 使用 TDesign `RadioGroup`，但每个 `Radio` 保持默认块级布局；[同文件样式](../apps/client-mobile/src/views/mobile/ProfileEditView.vue#L250) 只设置容器 `display:flex` 与间距。TDesign `Radio` 文档提供 `block=false` 与 `borderless`。
- **改进方案**：三个 `Radio` 使用官方 `block=false`、`borderless`，单项保持不换行，均匀分布；每个选项含圆点与文案的整体触控区至少 44px 高。
- **预期效果**：选项整齐且更易点选。

### UI-09｜空间预约：人数控件与辅助说明挤在一行｜中｜UI 设计

- **现象与证据**：预约页下半部分的 TDesign `Stepper` 后紧接“至少 1 人，不超过该空间容量 12 人”，文字与控件混在同一基线，部分句子跨行拥挤。
- **代码定位**：[SpaceReserveView.vue](../apps/client-mobile/src/views/mobile/SpaceReserveView.vue#L349) 将 `Stepper` 与说明文本同放在 `FormItem` 控件区；仅靠 `.field-help` 的上间距无法确保换行。
- **改进方案**：保持 TDesign `Stepper`，将规则移至 `FormItem` 的官方 `help` 属性/槽，或在控件下方独占整行；控件与说明至少相隔 8px，说明使用 14px、足够对比度。人数较小的会议室可优先展示“1/12 人”的简短规则。
- **预期效果**：数量与限制分层明确，避免误读。

### UI-10｜深色模式：辅助信息和品牌蓝标签对比偏弱｜中｜UI 设计

- **现象与证据**：切换深色模式后，设置页“深色”状态值、个人中心 UID/身份标签、蓝色图标与深灰卡片之间层级不清，远比浅色模式难辨。
- **代码定位**：[tokens.css](../apps/client-mobile/src/styles/tokens.css#L76) 主要沿用 TDesign 暗色 token；同文件仅对**浅色**占位字色做额外覆写（第 497 行附近）。
- **改进方案**：按页面实际底色测量文字/图标对比度，正文和关键信息目标至少 4.5:1，大图标与交互状态至少 3:1。优先通过 TDesign 的 `--td-text-color-*`、品牌色和容器色语义变量调整暗色状态，不给单页写孤立色值；保留已统一的主色语义。
- **预期效果**：暗色界面的身份、状态和操作信息可读性提高。

### UX-11｜人才名片：空个人简介仍渲染整张空卡｜中｜UX 体验

- **现象与证据**：人才 U1016 详情只有姓名、等级；“个人简介”卡片标题下为空白，用户无法判断是未填写还是加载失败。
- **代码定位**：[TalentCardView.vue](../apps/client-mobile/src/views/mobile/TalentCardView.vue#L87) 无条件输出 `card.intro`；技能等后续区块则有条件渲染。
- **改进方案**：简介为空时显示明确的“该成员暂未填写简介”；对公开名片可只保留必要身份信息和可用的联系/收藏操作。列表页也给资料缺失者稳定的占位文案，避免卡片只剩名字。
- **预期效果**：空资料仍有可理解的状态，企业/人才浏览体验更专业。

### UI-12｜积分商城：两列商品卡关键说明被过度截断｜中｜UI 设计

- **现象与证据**：393px 视口下，商品名称常被拆成两行，权益说明只露出一小段省略号；如“路演彩排时长券”无法在列表判断使用条件，需要逐个进入详情。
- **代码定位**：[MallView.vue](../apps/client-mobile/src/views/mobile/MallView.vue#L188) 固定两列网格，[同文件](../apps/client-mobile/src/views/mobile/MallView.vue#L256) 将描述限制为一行。
- **改进方案**：两列保留商品名、积分、库存三个核心字段；权益券的有效期/使用条件可在卡片下方用两行摘要，实物商品可保留单行。对长名称允许最多三行或在窄屏切一列。使用现有 TDesign `Tag` 标识“权益券/实物”，以免依赖被截断的正文。
- **预期效果**：列表能支持快速比较，减少无效进出详情。

### UX-13｜公共列表：联调与无意义测试内容混入展示｜中｜UX 体验

- **现象与证据**：首页、需求、活动、文章、人才/企业列表可见“联调”“验证”“哈哈哈哈”等测试文案；对公众产品而言会削弱可信度。本轮属于当前测试环境观察，发布环境是否同源需核对。
- **代码定位**：多个列表组件直接展示 API 内容，例如 [HomeView.vue](../apps/client-mobile/src/views/mobile/HomeView.vue)、[PlazaView.vue](../apps/client-mobile/src/views/mobile/PlazaView.vue)、[CommunityView.vue](../apps/client-mobile/src/views/mobile/CommunityView.vue)。问题源头更可能是内容治理与环境数据隔离。
- **改进方案**：在公开环境建立测试内容隔离/下架规则；运营发布前检查标题、摘要、头像及日期，空内容走明确占位。保留测试环境的联调用例但与公众展示数据分开。
- **预期效果**：首页与广场形成可信的商业化第一印象。

### UI-14｜我的预约：日期与提交时间串成一行后孤立换行｜低｜UI 设计

- **现象与证据**：`/me/reservations` 第一条卡片把预约日期、时段、提交时间写在一行；在 393px 宽度下“19:36”独占下一行，层级混乱。
- **代码定位**：[MyReservationsView.vue](../apps/client-mobile/src/views/mobile/MyReservationsView.vue) 的 `.meta` 使用单行 flex 承载较长信息。
- **改进方案**：第一行突出“9 月 25 日 09:00–10:00”，第二行弱化显示“提交于 9 月 23 日 19:36”；保持 16px 卡片内边距与 8px 行间距。不要把提交时间与预约时间连写。
- **预期效果**：用户一眼识别真正预约的时段。

### UX-15｜顶部分类切换：读屏树只暴露文字｜中｜UX 体验

- **现象与证据**：在广场“活动/资讯”、社区“服务/人才/企业”和需求分类页，测试浏览器的无障碍树将分类显示为普通文本；底部 TabBar 则能识别为 tab。触控可切换，但读屏选中态与键盘操作需在实体设备复核。
- **代码定位**：页面分别使用 TDesign `Tabs`/`TabPanel`，例如 [PlazaView.vue](../apps/client-mobile/src/views/mobile/PlazaView.vue#L211)、[CommunityView.vue](../apps/client-mobile/src/views/mobile/CommunityView.vue#L260)。这可能与组件 DOM/浏览器无障碍映射有关，尚不能仅凭浏览器模拟断定 iOS VoiceOver 同样失效。
- **改进方案**：先用 iPhone VoiceOver 验证“选项卡、当前选中、可切换”的播报与手势。若复现，沿用 TDesign `Tabs`，针对其渲染导航补齐可聚焦、选中态与关联面板语义；不要另写一套视觉标签替代组件。分类区保持约 48px 可触达高度。
- **预期效果**：分类导航对触控、键盘和辅助技术用户一致可用。

## 优先实施顺序与验收

1. **先修关键选择逻辑**：UX-02、UX-03。验收包括日期取消不触发脏表单、当天过去时段不可选。
2. **再修结果可信度**：UX-01、UX-04～UX-07。验收时核对导出消息反馈、新旧关键词结果隔离、活动截止规则、报名确认、已通过预约的完整状态记录。
3. **统一可读性**：UI-08～UI-12、UI-14 与 UX-15。至少在 393×852、375×812、深色/浅色以及系统字体放大场景做视觉和操作验收。
4. **发布前清理内容**：UX-13。在接近公开环境的数据集上复测首页、广场、人才和企业库。

本报告仅评估当前测试账号可见内容和已操作路径。管理员端、多角色权限差异、真实系统键盘/VoiceOver、弱网耗时及后端最终拦截逻辑仍需专项验收。
