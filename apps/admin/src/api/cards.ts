import { httpGet, httpPut } from './http'
export type CardType = 'individual' | 'enterprise'
export const cardSegmentFields: Record<string, { key: string; label: string }[]> = Object.fromEntries(
  Object.entries({
    education: { school: '学校', major: '专业', degree: '学位', period: '起止时间' },
    work: { company: '公司', title: '职位', period: '起止时间', description: '工作内容' },
    projects: { name: '项目名称', role: '角色', period: '起止时间', description: '项目简介' },
    honors: { name: '荣誉名称', date: '获得时间' },
    socials: { label: '名称', url: '链接' },
    customLinks: { label: '名称', url: '链接' },
  }).map(([key, fields]) => [key, Object.entries(fields).map(([key, label]) => ({ key, label }))]),
)
export interface CardRow {
  id?: string; userId?: string; name?: string; displayName?: string; intro?: string; description?: string
  age?: number | null; politicalStatus?: string | null; industryExperience?: string | null; skills?: string[]
  education?: Record<string, string>[]; work?: Record<string, string>[]; projects?: Record<string, string>[]
  honors?: Record<string, string>[]; socials?: Record<string, string>[]; customLinks?: Record<string, string>[]
  visibility?: { age: boolean; politicalStatus: boolean }
  logo?: string; industry?: string; size?: string; foundedAt?: string; website?: string; address?: string
  services?: string[]; advantages?: string[]
}
export const cardFields: Record<CardType, { key: string; label: string }[]> = {
  individual: Object.entries({ displayName: '展示姓名', age: '年龄', politicalStatus: '政治面貌', intro: '个人简介', industryExperience: '行业经验', skills: '相关技能', education: '教育经历', work: '工作经历', projects: '项目经历', honors: '荣誉证书', socials: '社交链接', customLinks: '自定义链接', visibility: '公开可见性' }).map(([key, label]) => ({ key, label })),
  enterprise: Object.entries({ logo: '企业 Logo', industry: '所属行业', size: '企业规模', foundedAt: '成立时间', website: '企业官网', address: '办公地点', description: '企业简介', services: '主营业务', advantages: '核心优势' }).map(([key, label]) => ({ key, label })),
}
export const fetchCards = (type: CardType, page: number, keyword: string) => httpGet<{ list: CardRow[]; total: number }>(`/cards/${type}?page=${page}&pageSize=20&keyword=${encodeURIComponent(keyword)}`)
export const fetchCard = (type: CardType, id: string) => httpGet<CardRow>(`/cards/${type}/${id}`)
export const fetchCardSchema = (type: CardType) => httpGet<{ type: CardType; editableFields: string[] }>(`/cards/schema/${type}`)
export const saveCardSchema = (type: CardType, editableFields: string[]) => httpPut(`/cards/schema/${type}`, { editableFields })
export const updateCard = (type: CardType, id: string, data: object) => httpPut(`/cards/${type}/${id}`, data)
