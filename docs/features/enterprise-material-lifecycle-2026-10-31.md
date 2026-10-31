# 企业代办材料生命周期（2026-10-31）

## 已确认规则

用户已明确：上传但未提交的不保存；已提交未办结的材料持续保留，直至办结才开始计时；办结附件默认保留90天，后台可配置；不提供用户申请删除入口，不向用户显示保留期限。后续明确：到期**仅删除上传附件**，表单资料、办理编号、状态与时间线继续保留。

本规则覆盖企业注册、财税、工商变更、资质许可四类业务。只有status=completed算办结；pending/processing/needs_info/rejected/withdrawn仍保留，因为后三类状态允许继续办理或修改重提。原有已绑定的历史替换附件也随该申请办结时刻起算，未办结时不清理。

## 本轮实现

两端选文件只保留页面内存里的File或系统临时路径，未发送独立上传请求，不使用Storage/IndexedDB/saveFile保存代办草稿。离开表单释放临时引用。已提交材料修改时仍走鉴权预览；新选择材料显示“已选择”，只有点击提交或重提才上传。

提交沿用原URL，支持multipart/form-data：payload字段为JSON字符串，附件字段名为客户端UUID；单文件10MB、整单附件64MB、最多64个附件、payload最多1MB。浏览器使用FormData；小程序按微信官方API类型声明使用ArrayBuffer和二进制文件读取，自行组装UTF8 multipart，不进行base64扩容。请求保留现有幂等键，失败保留本地文件供重试；登录身份变化时不发送旧账号材料。资料成功提交后释放本地文件对象。

服务端在内存中接收整单附件，校验文件魔数与表单引用，再与申请绑定。存储路径含内容hash与请求随机后缀，避免同一客户端ID的并发内容互相覆盖。写对象之前记录不可绑定的处理意图；成功提升附件时用事务移除意图，进程中断仍有清理线索。处理中租约5分钟；提交失败或未采用的副本立即尝试清理，删除失败保留可恢复记录，15分钟后可重试，不留下不可追踪的存储对象。业务正常流程不存在服务器端未提交草稿；故障补偿任务可能短期保有待清理的处理副本。

独立上传HTTP接口返回410并提示更新客户端，防止旧客户端继续保存未提交材料；JSON提交仍兼容既有合法附件引用。API、移动Web和小程序应协调更新，旧小程序版本需要升级后才能选择新材料。服务层旧上传辅助方法仅供隔离fixture构造历史记录，不作为HTTP入口。

四申请表新增completedAt，由数据库在状态首次转completed时写入UTC办结时间；旧完成记录从完成事件回填，没有可用时间时从迁移时刻起算，避免错误提前删除。SystemConfig新增enterpriseAgencyFileRetentionDays，默认90，允许1–3650整数。后台位于“系统设置 → 站点与功能 → 功能开关 → 企业代办”，保存后清理任务读库生效；省略字段保留旧值，非法值（含null）400，客户端公开配置不返回该字段。

原任务enterprise-agency-orphan-cleanup保留监控标识，每小时第10分钟自动执行遗留未绑定清理及办结到期附件清理；旧ORPHAN_CLEANUP_ENABLED/ORPHAN_GRACE_HOURS环境开关已停用，策略按本次用户决定执行。清理按批处理，默认每次最多100件，删除失败保留重试状态。企业代办总开关关闭时仍执行到期清理。

办结清理先锁系统配置和申请，复核当前保留天数、完成状态与完成时间，再认领附件。有效租约防止多实例重复认领；更新保留天数后按新值重新判断尚未删除的材料，已经删除的对象不能因延期恢复。只删除存储对象并标记附件不可用，不清空payload、不删除联系人字段、不改变申请revision和时间线；到期附件鉴权读取404。客户端不展示90天、截止日期或删除申请入口。文件对象进入清理的实际时刻由每小时任务及批次决定，不宣称精确到秒物理删除；外部导出或独立备份不由此存储任务清理，恢复备份后应先执行到期预检/清理。

## 迁移及运行

API迁移20261031040000_enterprise_material_retention已在隔离库和本地日常库增量部署，未重置日常数据。新增字段包括completedAt、contentHash、submissionLeaseUntil、retentionPurgeStartedAt及系统配置天数；数据库约束仍禁止把没有到期清理标记的已绑定材料直接改为deleting。

Prisma generate仍因Windows引擎DLL占用报EPERM，JS/类型已更新且通过构建和隔离运行，不将该命令记为成功。未终止其他开发进程。

## 验证与截图

- API：typecheck、lint、unit31组206项、build；隔离e2e三组93项通过。覆盖四业务办结清理、办理中长期保留、配置延期/主开关关闭、并发认领、删除失败重试、表单与时间线保留、旧上传410、multipart内容校验、同键并发/重放、异内容不覆盖、部分对象写入及补偿删除异常。环境joinyuu_it、Redis15及独立上传目录。
- 后台：typecheck、lint、test:ui38项、build通过；浏览器将保留天数改为120，保存/刷新后回显120，公开客户端配置不含天数，结束恢复原值。图片与admin-retention-report.json在apps/admin/test/artifacts/enterprise-material-lifecycle-20261031/。
- 移动Web：typecheck、lint、56文件177项测试、build通过。三扩展服务重新完成9事件办理链，首次提交为multipart，选材阶段无独立上传请求；报告与长页/逐屏截图同上目录，records均为completed且recordCount=9，errors为空。后台开关测试已修正为等待真实配置回填，不能拿默认加载值判断保存失败。
- 小程序：npm test61项通过，162JS/101JSON/84页面/94Less检查。微信IDE实际验证三服务新建及注册旧单补件：选材后为local引用，服务端文件GET404；提交后文件GET200，元数据与文件编号一致。证据apps/api/.tmp/enterprise-material-lifecycle-mini-20261031/，三服务report.json与注册registration-report.json分开保存；含local-selected/submitted/registration-revised截图。模拟器不替代iOS/Android真机验收。

可复现驱动：根仓scripts/browser/enterprise-services-acceptance.mjs（支持AGENCY_E2E_OUT）、enterprise-material-retention-admin.mjs、enterprise-material-lifecycle-mini.ps1。先启动API隔离fixture17757及构建后的移动Web17759，后台17758同样指向隔离API；设置PLAYWRIGHT_PACKAGE及AGENCY_E2E_FIXTURE。小程序驱动仅使用合成PDF，选择器API为受控mock，文件在微信沙箱测试目录创建并在结束清除；同时恢复原会话、wx API、siteConfig、主题缓存与模拟器明暗模式。截图、私有JWT文件和运行日志不提交Git。

依据：TDesign MCP分别查询vue-next input-number/form、mobile-vue upload及miniprogram组件用法。微信二进制请求和文件读取核对[微信官方API类型声明](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)，未采用其他端API。

## 条件组合视觉与提交边界专项（2026-10-31 补充验收）

在隔离环境（fixture 17757、移动 Web 17759）完成两类此前标记为余项的验证，结果均通过：

**条件组合视觉补齐**（截图 `apps/admin/test/artifacts/enterprise-combos-20261031/`，30 张，含 report.json，errors=[]）：

- 财税年报汇算组合：双事项多选、一般纳税人、60 张以上票据、社保/公积金三态、需交接历史报表双附件、成立日期/行业/员工数选填、长公司名（全页 3621px，超两屏）。
- 工商变更七类型并存：名称（含双备选）、法定代表人（双面证件预览）、非本社区地址、增资、股权 3 行转让（甲乙 40%/丙丁 35%/戊己 25% 合计 100%）、董监高、其他（全页 6458px，超四屏）。
- 资质许可类型切换：ICP 专项（企业主办、域名、接入服务商）与人力资源专项（3 名专职人员、固定场所）互斥显隐正确（2730/2610px）。
- 申报前条件块显隐断言全部通过：年报目的下不显示记账起始月、ICP 下不显示食品负责人、hr 下不显示 ICP 网站字段。

驱动脚本：`scripts/browser/enterprise-combos-visual.mjs`（只截图与断言显隐，不提交申请）。

**multipart 提交边界专项**（API 层直连隔离 17757，注册与财税入口）：

- 65MB 单文件 → 400「文件过大」；1.1MB payload → 400「Field value too long」。
- 附件引用与上传不匹配 → 400「附件与表单引用不匹配」；非法魔数 → 400「附件格式或大小不正确」。
- 身份证校验位非法 → 400；股东满 20 名 + 42 份合法 PNG（含法人双证）multipart 整单提交 → 200（注册 EA5）。
- 进行中唯一约束在边界数据下仍正确返回 409。

结论：64MB 总量、单件 10MB、payload 1MB、64 附件数、20 股东上限、魔数与引用一致性校验在真实 multipart 链路上均生效；复杂条件组合的表单渲染无布局或显隐缺陷。

## 验收边界

本轮材料保留规则已确认并实现，原“待确认材料期限/用户删除申请/是否显示期限”不再是未决项。企业代办整体仍保留真机键盘/大字号/安全区和地区指南核验事项，详见[验收补强](enterprise-services-hardening-2026-10-31.md)。收费仍属下一阶段。


本轮隔离fixture与移动Web17759已结束，原有后台17758服务保留；它仍需隔离API17757才能复现。验收驱动应顺序运行，不要在UI流程进行中重置隔离库。原登录、选择器/API包装和主题均已恢复。


## 中文提交与推送

API main 693bdba；后台 main eb038ab；移动Web main f075460；小程序 main 20e7f6b，均已推送。根仓本记录、正式契约、生成索引及验收驱动另行提交。原有临时计划与未跟踪资料保留，不纳入正式提交。
