# 企业代办模块验收补强（2026-10-31）

本轮基于扩展服务计划的验收差距推进；关联[首次验收记录](enterprise-services-acceptance-2026-10-31.md)、[开关验收](enterprise-agency-visibility-2026-10-31.md)、[后续工作](enterprise-services-backlog.md)。

## 已实现

- 聚合mine及activeByService采用字段白名单，仅返回id/serviceType/status/companyName/summary/submittedAt/updatedAt，不含联系人、电话、payload和时间线。每服务读取最多pageSize+1条历史及1条最新进行中摘要，增加四表userId/submittedAt/id联合索引。游标按时间降序、服务升序、ID降序比较，记录移动或软删除后仍可继续；翻页期间新插入头部记录需刷新查看，不提供跨页快照隔离保证。
- 四类申请增加持久revision：新建1，数据库触发器在状态、payload、records或软删除发生实际变化时递增。并发安全仍使用申请/用户行锁，不提供expectedRevision条件写接口；读取、失败事务及幂等重放不改变版本。旧行按已有事件数量回填，最低1，不能当作历史精确修改次数。
- 新时间线事件具有UUID；旧事件按服务+申请编号、原始下标和原始内容派生稳定兼容ID，下次追加时随历史记录持久化。用户接口先计算ID再过滤内部备注，后台和用户可见的同一事件ID相同。
- 三扩展服务保存schemaVersion=1、catalogVersion=2026-10-31；旧行明确legacy，新重提切换到当前版本。显式提交过期版本400，省略的已安装旧客户端兼容接收。consent.version校验为2026-10，agreedAt由服务端生成，不信任客户端时钟。注册旧授权校验规则保持兼容。
- 服务目录增加版本化采集准备清单：三财税目的、八变更事项、八许可类型；带来源与核对日期，动态列出应准备的信息及必传材料。两端按同一HTTP目录渲染；历史报表仅交接时出现，法人证件仅勾选该事项出现，附件状态按真实fileId展示，移除后恢复待上传。
- 准备清单仅代表本站表单要求；不是地方政府办事指南，也不承诺可办、收费金额或办结时限。工作人员仍核实地区、代表授权及可办条件。各地区官方指南/来源核验尚未完成，不能据此勾选全部L3/L4。

## 数据迁移和兼容

新增20261031030000_enterprise_application_versions、20261031031000_enterprise_mine_indexes；均为增量添加列、触发器与索引。本地日常库已增量部署，没有重置数据。新服务开关、总开关、收费及自动清理策略未被本轮更改。

Prisma generate再次遇到已加载Windows引擎DLL的EPERM；生成的JS/类型已更新并通过类型、构建与隔离运行。该命令不记为成功。依赖升级/完整重新生成时应先处理占用，不杀死其他开发进程。

## 验证

API命令在apps/api独立执行：pnpm typecheck、pnpm lint、pnpm test:unit、pnpm build；隔离e2e使用node scripts/integration.mjs test --runTestsByPath test/enterprise-services.e2e-spec.ts test/enterprise-agency.e2e-spec.ts test/monitor.e2e-spec.ts。数据库joinyuu_it、Redis15及隔离上传目录，禁止将此命令改接日常库。

本轮新增专项：三服务暂停配置持锁→新建实际SQL等待→关闭提交后403；三服务清理与绑定同时执行只能安全成功或完整回滚；同字面ID跨服务独立分页；移动/软删除游标+新插入头部；稳定事件ID/并发备注后版本/重提幂等版本不增；八许可类型资料分支；显式旧目录/表单/授权版本拒绝。

自动测试结果：API unit31组206项、定向隔离e2e3组83项；移动Web55文件174项；小程序57项，160JS/101JSON/84页面/94Less检查。后台本轮无代码修改，沿用上一轮38项测试及权限/主开关实际页面验收，不把旧结果计作本轮重跑。

移动Web新UI检查依据ui-ux-pro-max及TDesign mobile-vue MCP；小程序按wechatide-skill及TDesign miniprogram MCP。两端分别查询collapse的API/DOM，使用本端包。小程序移除collapse/collapse-panel打包排除、IDE构建npm并执行prepare:npm；新增组件深层观察form.**并受控绑定展开状态；兼容首次多选属性同步为数字键对象的实际运行情况，新增回归测试。

## 视觉证据与复现

- Web：apps/admin/test/artifacts/enterprise-preparation-20261031/；report.json记录19个已选择事项、错误列表；含三表单完整长图、逐事项截图、320/390宽度及深色截图。脚本为根仓scripts/browser/enterprise-preparation-acceptance.mjs，依赖隔离API17757和Web17759；设置PLAYWRIGHT_PACKAGE及AGENCY_E2E_FIXTURE。Vite固定代理7757，脚本将该验收会话的真实API请求转发到17757，不伪造业务响应。截图含合成用户，不提交Git。
- 微信IDE：apps/api/.tmp/enterprise-preparation-mini-20261031/；本轮自动化驱动19个事项切换通过（3财税+8变更+8许可），记录report.json与三表单顶部/滚动650截图，并人工复核展开及深色；这不代表所有专项字段组合已经视觉验收。复现脚本为根仓scripts/browser/enterprise-preparation-mini.ps1；只操作隔离服务，结束恢复原token/profile/identity、主题缓存/偏好、wx API包装、siteConfig及模拟器明暗模式。截图覆盖顶部/650滚动位置和深色；实际展开/分支结果以report和最终复核为准，不能以触发refresh代替通过。
- 早期失败原因已定位：Web开发代理误接日常服务、测试文案与现有选项不一致；小程序selectComponent应使用ID，TDesign虚拟宿主本身不产生布局盒，坐标需读取组件内实际.t-collapse节点；另发现组件深层观察/展开绑定及数字键多选兼容需修复。API复跑还识别出隔离浏览器fixture遗留注册记录会污染聚合用例，已补四服务清理隔离。失败不作为通过证据，最终重跑结果为准。

## 验收结论与未决项

可继续进行信息采集与人工办理闭环的模块验收；暂不签署“全部完成/正式发布”，不删除本地计划。

1. 真机iOS/Android微信：键盘、大字号、安全区与动态长表单实测仍未完成。模拟器和320宽度Web不能替代真机。
2. 地区指南来源/核对日期与正式条件卡仍待运营核验，当前明确人工评估；不能虚构全国统一条件。
3. 未提交、替换、终态材料的保留期限、删除申请、备份处理及告知待确定。未确认前自动删除维持关闭；本轮已向用户提问。
4. 收费/报价/支付及电子合同等保留在下一阶段，不阻塞当前信息收集代码验收，也不冒称免费。
5. 显式expectedRevision写入不在当前行锁实现中；如需支持离线编辑冲突提示，应作为独立协议扩展设计，不能将现有revision字段当作已支持条件写。


本轮证据：Web19个选择分支、320/390宽度及深色检查通过，pageerror为空；微信IDE19个事项切换、三表单展开和深色检查通过，原登录与API包装已恢复，模拟器最终恢复浅色并重新编译。真机和材料保留问题维持未决，未将其标记通过。

## 提交与环境收尾

- API main：046f9d2（完善企业代办版本协议与聚合分页，补齐专项并发验收），已推送。
- 移动Web main：8ec461c（接入企业代办版本化准备清单与动态材料提示），已推送。
- 小程序 main：c31e9d9（同步企业代办准备清单并修复动态多选材料同步），已推送。
- 后台无本轮源代码修改，保留35bde8f；根仓提交本文、契约、生成模型索引及两份可复现验收驱动。原有未跟踪临时资料与本地计划/交接保留，不纳入提交。

fixture17757与本轮Web17759服务已停止，私有fixture随退出移除；未停止先前已有后台17758服务。开发者工具已重新编译，实际读取确认当前首页、theme=light、wrapped=false，原会话/API包装已恢复。公开驱动的模拟器明暗恢复赋值已修正；本轮最终浅色恢复另经CLI与运行时读取验证。
