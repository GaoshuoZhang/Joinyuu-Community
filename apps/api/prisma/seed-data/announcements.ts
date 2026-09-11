import type { Announcement } from '@/types'

/* 公告栏数据 — 命名前缀 AN1001+
 * 面向运营方的站点公告：新增即发布，支持下架/重新发布/置顶；客户端公告位仅展示已发布公告（M2 消费） */
export const announcements: Announcement[] = [
  {
    id: 'AN1001',
    title: '聚屿社区三周年庆典暨年度路演日报名开启',
    content:
      '2026 年 9 月 26 日，聚屿社区年度路演日将在聚屿路演厅举行。今年继续设置「AI 落地进行时」主题专场，欢迎各社区企业报名路演席位，社区个体可在活动中心提交分享申请。席位有限，先到先得。',
    pinned: true,
    status: 'published',
    publishedAt: '2026-09-08 10:00',
    createdAt: '2026-09-08 10:00',
  },
  {
    id: 'AN1002',
    title: '公共空间预约规则调整：会议室需提前一个工作日申请',
    content:
      '自 9 月 15 日起，共享会议室与洽谈室的预约需提前一个工作日提交申请，当日临时使用请至前台登记。路演厅与多功能厅仍需提前三个工作日申请并附活动方案。',
    pinned: true,
    status: 'published',
    publishedAt: '2026-09-05 09:30',
    createdAt: '2026-09-05 09:30',
  },
  {
    id: 'AN1003',
    title: '9 月电费分摊明细公示',
    content:
      '8 月办公区电费分摊明细已在社区公告栏张贴，各企业可至运营中心核对办公位用电读数，如有疑问请于 9 月 20 日前联系运营专员。',
    pinned: false,
    status: 'published',
    publishedAt: '2026-09-03 14:00',
    createdAt: '2026-09-03 14:00',
  },
  {
    id: 'AN1004',
    title: '社区积分商城上新：会议室优先预约卡补货',
    content: '会议室优先预约卡（300 积分）已完成补货，数量有限，先兑先得。',
    pinned: false,
    status: 'published',
    publishedAt: '2026-09-01 11:00',
    createdAt: '2026-09-01 11:00',
  },
  {
    id: 'AN1005',
    title: '台风天气安全提示',
    content: '气象台发布台风黄色预警，请各企业关好门窗、检查用电设备，注意上下班通勤安全。',
    pinned: false,
    status: 'withdrawn',
    publishedAt: '2026-08-28 09:00',
    createdAt: '2026-08-28 09:00',
    updatedAt: '2026-09-02 10:00',
  },
  {
    id: 'AN1006',
    title: '社区健身区器材维护通知',
    content: '健身区跑步机将于本周末进行例行维护，期间暂停使用，给您带来不便敬请谅解。',
    pinned: false,
    status: 'withdrawn',
    publishedAt: '2026-08-20 16:00',
    createdAt: '2026-08-20 16:00',
    updatedAt: '2026-08-25 09:00',
  },
]
