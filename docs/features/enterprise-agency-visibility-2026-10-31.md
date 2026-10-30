# 企业代办入口开关验收

2026-10-31用户要求：各业务可独立开关，关闭后客户端隐藏入口；关闭企业代办总开关，两端入口及后台菜单均隐藏。此要求更新此前“关闭后显示暂未开放卡片”的口径。

## 实现与提交

API `40ea261`、后台 `aebd82a`、移动Web `e8ae7ba`、小程序 `b211922`，均中文提交并推送main。

- `enterpriseAgencyOpen`总开关与`enterpriseRegistrationOpen`注册子开关默认true，兼容既有企业注册能力；另三项默认false保持不变。总开关不覆盖子开关值。
- 两端隐藏关闭业务的申请卡片；企业合作/人才介绍页的注册引流卡也受总/注册开关控制。单项关闭仍保留历史办理记录，避免已有申请失去入口。
- 总开关关闭后隐藏“我的”页企业代办入口、后台整个企业代办菜单，后台清理已打开代办标签；直达两端/后台页面跳回我的/工作台。
- 后台从公开`/api/app/config`读取总开关，普通运营不需要系统配置读取权限。保存配置时当前后台菜单立即更新；客户端进入/返回相关页面重新读取配置。
- API目录与新建检查由总/子开关共同控制。旧单查询、合法重提/处理API继续保留，隐藏不删除数据。注册上传接口仍保留原有行为，注册新建事务内拒绝关闭服务。

迁移`20261031020000_enterprise_agency_visibility`已增量部署本地日常库及隔离库，未重置日常数据。未主动开启三个扩展业务。

## 验证

API typecheck/lint/build、30套205项unit、注册/扩展/monitor隔离e2e共62项通过；后台typecheck/lint/build、test:ui 36项通过；移动Web typecheck/lint/build、54文件171项通过；小程序npm test 53项及样式编译通过。新增用例覆盖总开关覆盖子项、关闭注册后禁止新建及保留旧单重提、关闭卡片保留记录；小程序目录过滤有断言。

新增注册测试最初复用已绑定附件，先被附件校验400拒绝，不能据此判断开关失效；改用新上传的材料后，关闭新建403及旧单重提200均通过。

隔离浏览器真实调用配置保存接口验证：全部子项关闭时没有申请卡片；总关闭时Web我的页入口、后台菜单隐藏，直达页分别回我的/工作台。测试最后恢复隔离配置，关闭fixture17757及本轮Web17759。截图位于：

`D:\Projects\Joinyuu-Community\apps\admin\test\artifacts\enterprise-visibility-20261031\`

文件为`children-off.png`、`master-off-mobile.png`、`master-off-admin.png`。本地复现驱动为根目录`.tmp-visibility.cjs`，依赖隔离fixture私有文件及17757/17758/17759，不提交临时脚本或令牌。长期闭环脚本的暂停卡片断言已同步改为隐藏。

微信工具已刷新，实际运行时读到新开关，console错误查询为空。续作已通过微信开发者工具补齐小程序开关验收：财税、工商变更、资质许可逐项关闭隐藏/重新开启恢复；注册关闭后hub卡片及企业合作/人才介绍页引流卡隐藏，新注册直达页回到hub；总关闭后hub直达回到“我的”页且宫格没有企业代办，企业合作页也无引流卡；总开关重新开启保留子项设置，四服务恢复。已有注册办理记录全程保留。

小程序证据绝对目录为 `D:\Projects\Joinyuu-Community\apps\api\.tmp\enterprise-visibility-mini-20261031\`，共33张截图（每页0/650/1300滚动位置）及`report.json`。重点文件：`off-finance_tax-0.jpg`、`off-business_change-0.jpg`、`off-license-0.jpg`、`registration-off-hub-0.jpg`、`registration-off-intro-enterprise-650.jpg`、`registration-off-intro-talent-650.jpg`、`master-off-me-650.jpg`、`master-off-intro-650.jpg`、`reopened-hub-0.jpg`。已目视核对服务卡过滤、介绍页无残留空卡和我的页宫格收拢，未发现新的产品缺陷。

初次脚本直接等待onShow返回，但原页面onShow不返回异步load，因此读到了旧目录；改为等待目录load完成后复测通过。这是验收脚本时序问题，无业务源码修复。驱动已整理为根仓 `scripts/browser/enterprise-agency-switches-mini.ps1`（可传WorkspaceRoot/EvidenceDirectory，PowerShell语法检查通过），仅连接隔离17757，依赖fixture生成的私有文件；本轮实际执行源在API `.tmp/test-mini-switches.ps1`，两者检查主体一致。结果后恢复原会话、API包装与隔离配置，停止fixture并刷新模拟器清除内存账号缓存，不改日常配置。

Prisma generate此前遇既有Windows DLL占用EPERM，类型/构建/测试通过；依赖升级前关闭占用并重新生成。此次仅补齐验收和脚本，没有改动业务源码或重跑无关检查；实体机验收仍未完成。

## 后续

本次入口开关需求的模拟器验证已完成；旧单重提的接口回归仍以此前62项专项结果为准。本次没有重新提交旧单材料，不把“记录保留”扩大成所有补件组合验收。其他后续见 [上一轮剩余验收](enterprise-services-acceptance-2026-10-31.md) 中真机/大字号/键盘、复杂条件与专项竞争测试。本轮没有实现收费系统，自动清理仍未启用。
