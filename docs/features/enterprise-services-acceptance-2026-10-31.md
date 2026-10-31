# 企业代办扩展服务验收记录（2026-10-31）

本记录承接本地 `docs/handoffs/2026-10-31-enterprise-services-acceptance-handoff.md`。该交接中的浏览器阻塞已解除，后台未提交用例已完成验收并提交。本文固定已完成范围与剩余事项，不代表生产发布或全部设备验收完成。

## 提交与范围

| 仓库 | 本轮 main 提交（均已推送） | 主要结果 |
| --- | --- | --- |
| API | `0001789` | 三服务开关、暂停后旧单补件、服务表行锁、附件域隔离与清理保护 |
| 后台 | `2c69381`、`88188e4` | 接收在途浏览器用例、三服务完整办理验收、系统配置开关 |
| 移动 Web | `933b007` | 目录与暂停交互、进行中摘要、游标追加/失败重试、联系人回填与补件上下文 |
| 小程序 | `b8467ea` | 同步目录/回填/补件，修复新建编号、详情路由、通知路径、页面栈及条件字段显示 |

业务仓均通过HTTP接口协作。正式规则见 [企业代办规范](enterprise-agency.md)，接口见 [app-api](../backend/app-api.md)，后续范围见 [后续工作](enterprise-services-backlog.md)。

## 发现并修复

1. 扩展服务事务错误地锁注册申请表，无法串行保护自身时间线。改为描述符白名单选择实际业务表，增加三服务并发备注与状态动作测试。
2. 孤儿附件任务只检查注册关联，可能认领已绑定扩展申请的文件。查询与完成条件改为四个关联均为空；数据库CHECK同步禁止已绑定文件进入deleting/deleted。
3. 未绑定附件可能跨服务复用。上传域由服务路由决定，绑定与注册读取均校验domain；详情排除已删除/清理中的文件。
4. catalog硬编码启用。新增三个默认关闭的持久开关；新建与配置更新锁同一配置行；旧单查询、合法重提/补件及既有幂等重放继续可用。旧后台载荷省略新字段保持原值，null拒绝。
5. 目录/后台旧缓存可能缺开关字段。三项开关即时读库，fixture启用后也主动清系统配置缓存。
6. hub仅从第一页推断进行中申请。API增加activeByService；两端追加分页保留失败现场，记录键包含服务类型，失效游标支持刷新。
7. 三类表单回填漏联系人。两端从原payload恢复，不用当前账号资料覆盖；旧单上传带requestId并校验本人、服务与可补件状态。
8. 小程序新建成功丢弃返回编号，详情路由和通知映射不完整，重复重提可能撑满十层页面栈。修正编号与路由；保存后回已有同单详情，否则替换结果页。
9. 小程序WXML调用数组indexOf导致复选状态和工商条件区不显示。改为布尔映射；已实际截图确认经营范围选中并显示输入区，增加切换回归测试。年报事项同步修正。
10. 三服务补上未保存保护与保存后清理；Web表单标签使用label，供既有无障碍逻辑关联真实输入。

## 验收环境与结果

Windows、Node24，API独立测试库 `joinyuu_it`、Redis DB15、独立上传和测试密钥目录；API17757、后台17758、移动Web17759。仅使用合成资料。小程序经微信开发者工具CLI连接，验收时运行时包装将7757请求定向到隔离17757，未修改正式API配置。

| 检查 | 结果 |
| --- | --- |
| API typecheck / lint / build | 通过 |
| API unit | 30套、205项通过 |
| API代办专项隔离e2e | 注册 + 扩展服务 + monitor，3套59项通过 |
| 后台 typecheck / lint / test:ui / build | 通过，51项UI契约 |
| 后台真实浏览器专项 | 注册及三个扩展服务列表/详情、受理、补件、申请人API重提、刷新与完成通过 |
| 移动Web typecheck / lint / test / build | 通过，54文件171项测试 |
| 小程序 npm test | 53项通过，含158JS/100JSON/84注册页检查、93Less样式编译 |
| 微信开发者工具 | 刷新编译及三类真实上传/提交/详情/修改链通过；条件区修复后再次截图确认 |

接口最终复核命令（API仓）：

```powershell
node scripts/integration.mjs test --runTestsByPath test/enterprise-services.e2e-spec.ts test/enterprise-agency.e2e-spec.ts test/monitor.e2e-spec.ts
pnpm test:unit --runInBand
```

注册e2e会故意注入通知/审计故障并输出异常日志，用于断言事务回滚，最终测试通过。一次最终检查因误写monitor文件名失败，纠正为上面的真实路径后59项全部通过。

移动Web脚本 `scripts/browser/enterprise-services-acceptance.mjs` 从真实表单填入合成资料并上传。三个服务各完成 `submit → withdraw → resubmit → reject → resubmit → request_info → resubmit → accept → complete`，每单恰9条记录，修改时断言原联系人保留；检查完成后无撤回/重提入口。后台真实UI登录后暂停三项，核对旧单仍可见，再启用财税、保存、刷新并核对catalog同步。

小程序同样对三类走上述9事件链，包含补件重传。隔离编号：工商BR2、资质LA2、财税TE2；Web为TE3、BR3、LA3。不要用这些临时编号定位日常库；下次重种会清除隔离记录。

## 截图与复现入口

本机工作区绝对根路径为 `D:\Projects\Joinyuu-Community`。以下证据保留本机、不进Git；复制任务时同时复制对应目录。长页面包含实际滚动分段，不仅是全页截图。

| 证据 | 绝对路径或文件模式 |
| --- | --- |
| 小程序9事件结果 | `D:\Projects\Joinyuu-Community\apps\api\.tmp\agency-evidence-20261031\report.json` |
| 小程序表单分段 | 同目录 `{business-change,license,finance-tax}-form-{0,650,1300,1950}.jpg` |
| 小程序待处理/暗色完成 | 同目录 `*-pending-{0,650,1300}.jpg`、`*-completed-dark-{0,650,1300}.jpg` |
| 工商条件区修复后 | 同目录 `business-change-dynamic-fixed.jpg` |
| Web闭环报告与滚动截图 | `D:\Projects\Joinyuu-Community\apps\admin\test\artifacts\enterprise-services-20261031\report.json`、`*-form-scroll-*.png`、`*-pending-scroll-*.png`、`*-completed-scroll-*.png`，另含full全页图 |
| 暂停枢纽与后台开关 | 上述Web目录 `paused-hub-*.png`、`admin-switches.png` |
| 后台专项 | `D:\Projects\Joinyuu-Community\apps\admin\test\artifacts\e2e-20261015\followup-enterprise-agency.json`、`enterprise-service-*-completed.png` |
| 本轮小程序本地驱动 | `D:\Projects\Joinyuu-Community\apps\api\.tmp\run-mini-acceptance.ps1`，依赖预先安装隔离请求/合成文件包装，不是独立启动脚本 |

Web目录中的 `failure.png/admin-debug.png` 是调试失败时留存的旧图，不是最终失败结论；以最终report的三个completed与errors空数组、脚本退出0为准。旧交接称浏览器revision1234缺失；本轮核实已安装Playwright1.62可启动，包位于 `C:\Users\Gaoshuo\AppData\Local\Temp\pw-runner`，浏览器缓存实际位于AppData/Local/ms-playwright。无需照搬旧安装阻塞结论。

环境重建和浏览器运行方法见 [联调说明](../workspace/browser-testing.md)。fixture只有15分钟有效窗口，私有文件含临时令牌，不要打印、转存到正式文档或提交。使用新fixture重新执行，不复用旧token。

## 迁移及清场

新增迁移 `20261031010000_enterprise_service_switches` 与 `20261031011000_enterprise_service_cleanup_guard` 已在隔离库及本地日常开发库完成增量部署，未重置日常数据。清理CHECK部署前检查异常绑定清理记录为0。最终日常库三开关均为false；自动删除策略未开启。

小程序请求、上传、选文件与确认框包装已恢复，原会话备份已恢复，主题恢复浅色；fixture和本轮移动Web17759进程已停止，私有fixture由退出清理。后台17758为先前已有静态服务，本轮未关闭；它指向已停止的隔离17757，下一轮需按说明重启依赖。Prisma generate曾因Windows引擎DLL占用报EPERM；已有生成客户端通过类型检查、构建和运行测试，不能把该次generate报成功，后续升级依赖前应关闭占用进程后重新生成。

## 未完成及继续顺序

1. **发布前设备验收**：实际iOS/Android微信、软键盘、系统大字号、窄屏、长名称/多变更类型组合及安全区；本轮模拟器浅/深色及长页分段不能代替真机。尚无上传手机体验版验收结论。
2. **补齐条件分支的视觉/交互覆盖**：已有工具校验覆盖年报/旧账、资本、劳务派遣、HR、ICP等，但三类9事件主链只取代表性载荷；不能宣称所有矩阵组合都手工通过。优先年报多选、法人证件、股权多人附件、ICP字段与键盘遮挡，按每屏滚动截图。
3. **并发专项已补齐（2026-10-31 第二轮）**：三服务分别验证暂停配置持锁时新建等待、扩展文件绑定与清理竞争；聚合接口验证同字面ID跨服务隔离、移动/软删除游标记录及插入头部后的连续分页。mine改为每服务最多pageSize+1条并独立查询最新进行中摘要，列表与摘要均不再返回联系人或电话。
4. **版本与准备清单已补齐基础协议**：四表新增持久revision（数据库触发器维护），新事件UUID、旧事件稳定兼容ID；三扩展服务保存schemaVersion/catalogVersion，consent.agreedAt由服务端写入。两端使用API同版信息采集准备清单，支持动态材料待上传/已上传状态。这不是各地行政办理指南，核验过的地区指南及法定条件卡仍需维护。并发控制继续采用行锁，不宣称已实现expectedRevision乐观写入协议。
5. **运营启用与收费下一阶段**：确认实际可办范围、服务资格、告知和保留政策后逐项开启；社区可收费，当前不自动报价/收款。收费设计见后续工作，不在申请六态内加入付款状态。孤儿附件自动删除保持关闭，7天仅是待确认建议。
6. **最终计划清理**：上述发布前验收与范围决议未全部完成，因此保留本地计划文件并更新进度；不要提前勾选全部DoD或删除计划。正式文档已同步，本轮结果以本文为准，旧交接仅作历史参考。
