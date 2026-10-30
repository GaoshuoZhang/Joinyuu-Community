# 登录态 UI/UX 取证清单 · 2026-10-30

完整背景见 [审查记录](ui-ux-audit-2026-10-30.md) 和 [交接说明](ui-ux-handoff-2026-10-30.md)。

- 当前账号：个人用户、社区个体；首尾均确认业务已登录。365×814 逻辑像素，浅色模式。
- 78 条注册路由均到达目标，首轮 121 张；带参/动态分页/交互补测后，正式证据共 151 张。到达目标仅证明导航与所见状态，缺参页不代表正常业务验收。
- 图片目录：`C:\Users\Gaoshuo\AppData\Local\Temp\joinyuu-audit-logged-20261030`。表内为目录下文件名；全路径由目录与文件名组合。
- `00.json` 至 `77.json`、`detail-*.json`、`long-*.json` 与 `interactions.json` 为正式清单；ready JPG 为辅助等待截图。`diagnostics` 为失败工具尝试，不计入正式证据。

## 注册路由首轮

| 序号 | 目标与实际路由（相同） | 截图文件 |
| --- | --- | --- |
| 00 | `pages/home/index` | `00-0.jpg`, `00-1.jpg` |
| 01 | `pages/projects/index` | `01-0.jpg` |
| 02 | `pages/community/index` | `02-0.jpg`, `02-1.jpg` |
| 03 | `pages/plaza/index` | `03-0.jpg` |
| 04 | `pages/me/index` | `04-0.jpg`, `04-1.jpg`, `04-2.jpg` |
| 05 | `pages/auth/forgot-password` | `05-0.jpg` |
| 06 | `pages/auth/login` | `06-0.jpg` |
| 07 | `pages/auth/register` | `07-0.jpg` |
| 08 | `pages/search/index` | `08-0.jpg` |
| 09 | `pages/webview/index` | `09-0.jpg` |
| 10 | `pkg/application/cooperation` | `10-0.jpg`, `10-1.jpg` |
| 11 | `pkg/application/individual` | `11-0.jpg`, `11-1.jpg` |
| 12 | `pkg/application/settle` | `12-0.jpg`, `12-1.jpg`, `12-2.jpg` |
| 13 | `pkg/checkout/confirm/index` | `13-0.jpg` |
| 14 | `pkg/checkout/index/index` | `14-0.jpg` |
| 15 | `pkg/checkout/result/index` | `15-0.jpg` |
| 16 | `pkg/demand/coop-form/index` | `16-0.jpg`, `16-1.jpg`, `16-2.jpg` |
| 17 | `pkg/demand/detail/index` | `17-0.jpg` |
| 18 | `pkg/demand/hub/index` | `18-0.jpg` |
| 19 | `pkg/demand/invest-form/index` | `19-0.jpg`, `19-1.jpg`, `19-2.jpg` |
| 20 | `pkg/demand/mine/index` | `20-0.jpg` |
| 21 | `pkg/demand/my-responses/index` | `21-0.jpg`, `21-1.jpg`, `21-2.jpg`, `21-3.jpg`, `21-4.jpg` |
| 22 | `pkg/demand/task-form/index` | `22-0.jpg`, `22-1.jpg`, `22-2.jpg` |
| 23 | `pkg/event/checkin` | `23-0.jpg` |
| 24 | `pkg/event/detail` | `24-0.jpg` |
| 25 | `pkg/intro/cooperation` | `25-0.jpg`, `25-1.jpg` |
| 26 | `pkg/intro/enterprise` | `26-0.jpg`, `26-1.jpg` |
| 27 | `pkg/intro/settle` | `27-0.jpg`, `27-1.jpg` |
| 28 | `pkg/intro/talent` | `28-0.jpg`, `28-1.jpg` |
| 29 | `pkg/mall/detail/index` | `29-0.jpg` |
| 30 | `pkg/mall/index/index` | `30-0.jpg`, `30-1.jpg`, `30-2.jpg`, `30-3.jpg` |
| 31 | `pkg/mall/order-detail/index` | `31-0.jpg` |
| 32 | `pkg/mall/rules/index` | `32-0.jpg`, `32-1.jpg` |
| 33 | `pkg/pages/article/detail` | `33-0.jpg` |
| 34 | `pkg/pages/article/mine` | `34-0.jpg` |
| 35 | `pkg/pages/article/my-detail` | `35-0.jpg` |
| 36 | `pkg/pages/article/new` | `36-0.jpg`, `36-1.jpg` |
| 37 | `pkg/pages/community/enterprise-showcase` | `37-0.jpg` |
| 38 | `pkg/pages/community/talent-card` | `38-0.jpg` |
| 39 | `pkg/pages/me/about/index` | `39-0.jpg` |
| 40 | `pkg/pages/me/application-detail/index` | `40-0.jpg` |
| 41 | `pkg/pages/me/applications/index` | `41-0.jpg` |
| 42 | `pkg/pages/me/enrollments/index` | `42-0.jpg` |
| 43 | `pkg/pages/me/enterprise-agency/detail/index` | `43-0.jpg` |
| 44 | `pkg/pages/me/enterprise-agency/index` | `44-0.jpg`, `44-1.jpg` |
| 45 | `pkg/pages/me/enterprise-agency/registration/index` | `45-0.jpg`, `45-1.jpg` |
| 46 | `pkg/pages/me/enterprise-detail/index` | `46-0.jpg` |
| 47 | `pkg/pages/me/enterprise-edit/index` | `47-0.jpg` |
| 48 | `pkg/pages/me/enterprise-member/index` | `48-0.jpg` |
| 49 | `pkg/pages/me/experience` | `49-0.jpg` |
| 50 | `pkg/pages/me/favorites/index` | `50-0.jpg` |
| 51 | `pkg/pages/me/history/index` | `51-0.jpg` |
| 52 | `pkg/pages/me/identities` | `52-0.jpg` |
| 53 | `pkg/pages/me/identity-guide` | `53-0.jpg`, `53-1.jpg`, `53-2.jpg` |
| 54 | `pkg/pages/me/individual-card` | `54-0.jpg`, `54-1.jpg`, `54-2.jpg`, `54-3.jpg`, `54-4.jpg` |
| 55 | `pkg/pages/me/invitation/index` | `55-0.jpg` |
| 56 | `pkg/pages/me/leases/index` | `56-0.jpg` |
| 57 | `pkg/pages/me/messages/index` | `57-0.jpg` |
| 58 | `pkg/pages/me/notices/index` | `58-0.jpg`, `58-1.jpg`, `58-2.jpg`, `58-3.jpg`, `58-4.jpg`, `58-5.jpg` |
| 59 | `pkg/pages/me/notification-settings/index` | `59-0.jpg` |
| 60 | `pkg/pages/me/points` | `60-0.jpg`, `60-1.jpg`, `60-2.jpg` |
| 61 | `pkg/pages/me/privacy/index` | `61-0.jpg` |
| 62 | `pkg/pages/me/profile` | `62-0.jpg` |
| 63 | `pkg/pages/me/project-detail/index` | `63-0.jpg` |
| 64 | `pkg/pages/me/projects/index` | `64-0.jpg` |
| 65 | `pkg/pages/me/realname` | `65-0.jpg` |
| 66 | `pkg/pages/me/records/index` | `66-0.jpg` |
| 67 | `pkg/pages/me/security/index` | `67-0.jpg` |
| 68 | `pkg/pages/me/stats/index` | `68-0.jpg` |
| 69 | `pkg/space/index/index` | `69-0.jpg`, `69-1.jpg` |
| 70 | `pkg/space/reservation-detail/index` | `70-0.jpg` |
| 71 | `pkg/space/reservations/index` | `71-0.jpg` |
| 72 | `pkg/space/reserve/index` | `72-0.jpg` |
| 73 | `pkg/trade/bills/index` | `73-0.jpg` |
| 74 | `pkg/trade/orders/index` | `74-0.jpg` |
| 75 | `pkg/trade/refund-apply/index` | `75-0.jpg` |
| 76 | `pkg/trade/refund-progress/index` | `76-0.jpg` |
| 77 | `pkg/trade/transaction-detail/index` | `77-0.jpg` |

## 带参及专项补测

| 目标/状态 | 截图文件 |
| --- | --- |
| `pkg/pages/article/detail?id=A1011` | `detail-0-0.jpg` |
| `pkg/demand/detail/index?id=D4007` | `detail-1-0.jpg` |
| `pkg/mall/detail/index?id=G1006` | `detail-2-0.jpg` |
| `pkg/space/reserve/index?id=S1001` | `detail-3-0.jpg`, `detail-3-1.jpg` |
| `pkg/space/reservation-detail/index?id=SR2021` | `detail-4-0.jpg` |
| `pkg/mall/order-detail/index?id=RO2020` | `detail-5-0.jpg` |
| `pages/webview/index` | `detail-6-0.jpg` |
| `pkg/space/reserve/index` | `detail-7-0.jpg` |
| `pkg/pages/community/talent-card?uid=U1016` | `detail-8-0.jpg` |
| `pkg/pages/me/notices/index` | `long-0-0.jpg`, `long-0-1.jpg`, `long-0-2.jpg`, `long-0-3.jpg`, `long-0-4.jpg`, `long-0-5.jpg`, `long-0-6.jpg`, `long-0-7.jpg`, `long-0-8.jpg`, `long-0-9.jpg` |
| `pkg/pages/me/points` | `long-1-0.jpg`, `long-1-1.jpg`, `long-1-2.jpg`, `long-1-3.jpg`, `long-1-4.jpg` |
| `pkg/pages/me/security/index (password/phone overlays)` | `security-password.jpg`, `security-phone.jpg` |
| `pkg/trade/orders/index?tab=orders (all status, 5 records)` | `orders-all.jpg`, `orders-all-middle.jpg`, `orders-all-bottom.jpg` |

空间列表/预约列表/兑换订单列表实际取得 S1001、SR2021、RO2020；商品列表取得 G1006。文章 A1011、需求 D4007 和当前用户公开名片 U1016 均打开正常内容。分页补测的末次状态确认 loading=false、hasMore=false 且已达底部。

企业管理员、企业代办真实申请与附件、现金订单/付款/退款提交、企业注册后续三步及最终提交、其他机型/深色/最大字号/软键盘/真机读屏仍不属于本轮完成范围。密码与手机号弹层只打开关闭，未发送验证码或修改账号。
