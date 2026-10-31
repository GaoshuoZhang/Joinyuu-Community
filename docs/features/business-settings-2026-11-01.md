# 业务设置就近维护（2026-11-01）

## 调整结果

配置回归所属业务页，右上角统一使用描边“业务设置”按钮；四个代办页位于“刷新”右侧。窗口采用一层选项卡，独立加载和保存，具备错误反馈、保存状态及未保存保护。复杂申请表单沿用可视化编辑器与高级JSON能力，窗口底部固定“保存表单”，不再往返系统设置。

| 业务页 | 设置内容 | 接口 scope |
| --- | --- | --- |
| 企业注册 | 基础启停、免费/固定/人工报价、金额、费用标题、退款说明、办结附件保留天数 | enterprise-registration |
| 财税服务 | 同上，仅作用本业务 | enterprise-finance-tax |
| 工商变更 | 同上，仅作用本业务 | enterprise-business-change |
| 资质许可 | 同上，仅作用本业务 | enterprise-license |
| 社区个体 | 个人名片可编辑字段、个体入驻表单 | individuals |
| 社区企业 | 企业名片可编辑字段、企业入驻表单、行业字典 | enterprises |
| 合作企业 | 合作申请表单、共用企业名片规则说明 | external-enterprises |
| 商品管理 | 积分商城入口启停 | mall |
| 需求管理 | 需求广场入口启停 | demands |
| 公共空间管理 | 空间预约启停 | spaces |
| 轮播图管理 | 首页轮播图总开关 | banners |
| 租赁管理 | 租约临期提醒天数 | leases |
| 用户管理 | 注册总开关、手机号/邮箱注册渠道 | users |
| 账号与权限 | 后台密码过期强制改密及有效天数 | admin-accounts |

个人名片白名单仍覆盖全部个人名片；企业白名单仍由社区企业和合作企业共用。迁移入口不拆分原有规则适用人群。单项代办停用后后台页面仍可访问、处理历史申请及重新开启；企业代办总开关继续保留在系统功能配置，关闭后可从该全局入口恢复菜单。

系统设置保留品牌、全局功能、身份核验、微信登录接入、文件存储、系统授权，以及主题、协议与政策、通知、统一收款配置。申请表单和名片字段移走；租约提醒移走后，“运行策略”仅剩的上传大小限制并入“文件存储”；“协议与政策”不再多套一层单项选项卡。旧申请表单地址根据类型引导到对应业务页，旧名片字段书签引导到社区个体设置。

## 收款判定

取消商城/空间/活动/租约/代办的独立在线支付发起开关。报价、下单、Native及小程序支付不再读取 cashMallOpen / cashSpaceOpen / cashEventOpen / cashLeaseOpen / cashAgencyOpen。

是否收费由原业务计价或代办首次受理的费用决定控制；是否可调起微信支付仍检查商户是否配置齐全、是否启用、实际渠道、应收状态、版本、归属及持久改价屏障。商品和空间的积分计价不改变，现金金额0不自动清空原积分价格。回调、查单及退款不依赖这些退役开关。

旧数据库字段暂保留以兼容消费者，不提供编辑入口，旧系统配置载荷不能再写回它们。公开配置里的兼容布尔值恒true，不代表微信商户已启用；实际能力以 commerce/capabilities 为准，两端沿用该能力接口。费用卡不再用退役开关解释支付不可用原因。

## API与权限

新增 `GET /api/admin/business-settings/:scope` 返回 `{ title, values }`；`PUT` 接收 `{ values, expected }`。只允许当前scope声明的全部字段，拒绝跨业务字段及非法值；在SystemConfig行锁内比较expected与当前值，不一致返回409，要求重新加载。收费字段变化时同步递增报价配置版本，已有费用决定保持原约定。配置更新和审计同事务，提交后失效共享配置缓存。

名片：`GET/PUT .../:scope/card`，仅individuals/enterprises可写。表单：`GET/PUT .../:scope/form`，分别绑定individual/settle/cooperation，沿用原DTO和可视化字段校验。行业：`GET/POST .../enterprises/industry`、`POST .../enterprises/industry/:code/toggle-status`、`DELETE .../enterprises/industry/:code`，复用原字典校验、缓存与审计；不要求全局字典权限，也不允许该入口操作其他字典类型。

每个scope均需原菜单权限、`perm:business-settings:<scope>`及对应数据域同时满足。新权限仅登记目录，不自动授予既有角色；超管沿用`*`。旧名片/申请表单写接口也补充相同业务设置鉴权，避免从旧URL绕过。全局系统设置的写入SQL剔除已迁走的业务字段，即使旧页面携带陈旧全量快照也不能覆盖业务页的新值。

## 材料保留期与迁移

增量迁移 `20261101000000_business_settings` 新增四列，初值逐一复制原 `enterpriseAgencyFileRetentionDays`，不改变已有保留策略：

- enterpriseRegistrationFileRetentionDays
- enterpriseTaxFileRetentionDays
- enterpriseChangeFileRetentionDays
- enterpriseLicenseFileRetentionDays

范围1–3650天，默认90。清理任务按附件所属业务读对应天数，认领时再次锁定该配置，防止延期设置与清理竞争。未提交不保存、未办结持续保留、办结后计时、仅清理附件、保留表单和记录、不向用户展示期限的规则均不变。旧公共列保留但不再作为运行时清理依据。

本机开发库已在备份后执行增量迁移。备份为 `D:\Projects\Joinyuu-Community\apps\api\.tmp\backups\before-business-settings-20261101.dump`，已通过pg_restore目录校验；未重置数据库。此前尚未应用的显式改价授权修正迁移亦一起部署。生产环境仍需按正常备份/部署流程执行迁移，先具备新列再启动新API；业务设置权限由管理员按需分配。

## 验证与证据

关联实现提交：API `d07a72b`、后台 `92572b1`；两端提交独立维护。均为开发分支代码交付，不代表生产发布。

- API：typecheck、lint、31套206项单元测试、build通过；七套相关隔离e2e158项通过，覆盖跨业务/权限/数据域、非法字段、并发配置冲突、独立保留期、陈旧全局表单、注册联动、退役开关及共享支付/材料回归。
- 后台：typecheck、lint、38项检查、build通过；浏览器18项验收通过，包含14个入口及保存/落库断言。
- 移动Web：typecheck、lint、57文件182项测试、build通过。小程序：npm test 61项通过；原“我的”页积分汇总注释不属于本需求，保留不提交。

浏览器脚本：`scripts/browser/business-settings-acceptance.mjs`。使用隔离joinyuu_it、Redis DB15和模拟商户fixture，端口17757/17758，验证14个业务入口、名片保存、未保存保护、可视化表单保存、保留期独立及系统设置瘦身；不调用真实付款。长表单在弹窗内滚动编辑，保存位于固定底部。

补验还定位并修复了原表单加载期可编辑导致新输入被初始数据覆盖的问题：加载期间禁用编辑和保存，保存后从API重新读取标题核对，成功提示不代替落库验证。小程序已通过开发者工具刷新、实际首页加载及无错误日志检查。

截图和报告：`D:\Projects\Joinyuu-Community\apps\api\.tmp\business-settings-20261101\report.json`及同目录PNG；各仓检查日志为`.tmp-business-*.log`，API为`.tmp/business-*.log`。这些本地证据与数据库备份不入Git，交接其他机器时单独复制，不复制私有测试令牌。失败截图属于排查历史，不代表最终验收结果。
