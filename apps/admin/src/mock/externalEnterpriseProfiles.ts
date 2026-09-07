/* 外部企业档案 — 补充聚合视图的展示属性（ID/行业/简介/合作数据）
 * 外部企业非入驻实体，无展示页；成员关系由用户 external_enterprise 身份派生
 * id 为外部企业唯一标识（XE7001+），跳转与筛选均以 ID 传参 */
export interface ExternalEnterpriseProfile {
  id: string
  name: string
  industry: string
  description: string
  cooperationCount: number
  firstCooperationAt: string
}

export const externalEnterpriseProfiles: ExternalEnterpriseProfile[] = [
  {
    id: 'XE7001',
    name: '远见资本',
    industry: '风险投资',
    description: '专注早期科技创投的财务顾问机构，与社区多家企业保持投融资辅导合作，定期参与社区路演活动担任评审。',
    cooperationCount: 6,
    firstCooperationAt: '2025-06',
  },
  {
    id: 'XE7002',
    name: '启衡咨询',
    industry: '财务咨询',
    description: '为科技创业公司提供财务规范化、融资尽调陪跑与股权设计咨询，创始人为社区企业资深财务顾问。',
    cooperationCount: 3,
    firstCooperationAt: '2025-09',
  },
  {
    id: 'XE7003',
    name: '鹿岛文化',
    industry: '文化传播',
    description: '新消费品牌内容营销与 IP 联名运营商，与社区设计类企业保持长期项目合作。',
    cooperationCount: 2,
    firstCooperationAt: '2026-01',
  },
  {
    id: 'XE7004',
    name: '拾光文创',
    industry: '文化创意',
    description: '城市文旅纪念品原创设计品牌，创始人已提交社区入驻申请，目前在合作过渡期。',
    cooperationCount: 1,
    firstCooperationAt: '2026-08',
  },
]
