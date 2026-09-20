/** 个人名片可增删分段的字段配置（key 对应表单中的列表字段）。 */
export type IndividualListKey = 'education' | 'work' | 'projects' | 'honors' | 'socials' | 'customLinks'

export interface IndividualListField {
  k: string
  label: string
  ph?: string
  textarea?: boolean
}

export interface IndividualListSection {
  key: IndividualListKey
  title: string
  fields: IndividualListField[]
}

export const INDIVIDUAL_LIST_SECTIONS: IndividualListSection[] = [
  {
    key: 'education',
    title: '教育经历',
    fields: [
      { k: 'school', label: '学校', ph: '如：浙江大学' },
      { k: 'major', label: '专业', ph: '如：工业设计' },
      { k: 'degree', label: '学历 / 学位', ph: '如：本科' },
      { k: 'period', label: '起止时间', ph: '如：2014 - 2018' },
    ],
  },
  {
    key: 'work',
    title: '工作经历',
    fields: [
      { k: 'company', label: '公司', ph: '如：某某科技' },
      { k: 'title', label: '职位', ph: '如：产品设计师' },
      { k: 'period', label: '起止时间', ph: '如：2021 - 至今' },
      { k: 'description', label: '工作内容', ph: '负责的事项与成果…', textarea: true },
    ],
  },
  {
    key: 'projects',
    title: '项目经历',
    fields: [
      { k: 'name', label: '项目名称', ph: '如：聚屿社区小程序' },
      { k: 'role', label: '担任角色', ph: '如：设计主理' },
      { k: 'period', label: '起止时间', ph: '如：2026' },
      { k: 'description', label: '项目简介', ph: '项目背景、成果…', textarea: true },
    ],
  },
  {
    key: 'honors',
    title: '荣誉证书',
    fields: [
      { k: 'name', label: '名称', ph: '如：红点设计概念奖' },
      { k: 'date', label: '获得时间', ph: '如：2023' },
    ],
  },
  {
    key: 'socials',
    title: '社交媒体链接',
    fields: [
      { k: 'label', label: '名称', ph: '如：GitHub / 即刻' },
      { k: 'url', label: '链接', ph: 'https://' },
    ],
  },
  {
    key: 'customLinks',
    title: '自定义链接',
    fields: [
      { k: 'label', label: '名称', ph: '如：个人作品集' },
      { k: 'url', label: '链接', ph: 'https://' },
    ],
  },
]
