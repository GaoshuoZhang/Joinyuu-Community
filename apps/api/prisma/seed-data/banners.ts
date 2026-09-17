import type { HomeBanner } from '@/types'

/* 首页轮播图（内容管理维护） — 命名前缀 BN1001+
 * 未配置图片时客户端使用品牌渐变文字卡展示；link 为移动端站内路径 */
export const banners: HomeBanner[] = [
  {
    id: 'BN1001',
    title: '2026 春季创业路演周',
    subtitle: '18 个项目集中路演，投资人现场对接',
    link: '/events',
    sort: 1,
    enabled: true,
    createdAt: '2026-09-01 09:00',
    updatedAt: '2026-09-01 09:00',
  },
  {
    id: 'BN1002',
    title: '办公空间限时入驻优惠',
    subtitle: '开放办公位首月 7 折，独立办公室可预约参观',
    link: '/spaces',
    sort: 2,
    enabled: true,
    createdAt: '2026-09-01 09:00',
    updatedAt: '2026-09-01 09:00',
  },
  {
    id: 'BN1003',
    title: '社区人才库升级',
    subtitle: '完善个人名片，解锁企业对接优先推荐',
    link: '/community?tab=talent',
    sort: 3,
    enabled: true,
    createdAt: '2026-09-01 09:00',
    updatedAt: '2026-09-01 09:00',
  },
]
