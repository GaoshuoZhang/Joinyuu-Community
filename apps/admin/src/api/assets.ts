import { httpDelete, httpGet, httpUpload } from './http'

/* 素材库 API（/api/admin/assets）
 * 形状：id AST* / url / fileName / mime / size / bizType */

export interface MallAsset {
  id: string
  url: string
  fileName: string
  mime: string
  size: number
  bizType?: string
  /** 引用来源：article=资讯发布 / submission=投稿内容（文章保存时绑定） */
  sourceType?: string
  /** 来源业务编号（如 A1010 / SU1006） */
  sourceId?: string
  createdAt: string
}

/** GET /api/admin/assets?bizType */
export async function fetchAssets(bizType?: string): Promise<MallAsset[]> {
  const qs = bizType ? `?bizType=${encodeURIComponent(bizType)}` : ''
  return httpGet<MallAsset[]>(`/assets${qs}`)
}

/** POST /api/admin/assets（multipart 上传，字段名 file；经对象存储返回真实 URL） */
export async function uploadAsset(file: File, bizType?: string): Promise<MallAsset> {
  const form = new FormData()
  form.append('file', file)
  if (bizType) form.append('bizType', bizType)
  return httpUpload<MallAsset>('/assets', form)
}

/** POST /api/admin/assets/:id/replace（multipart 替换：同 URL 覆盖存储内容，引用方即时生效） */
export async function replaceAsset(id: string, file: File): Promise<MallAsset> {
  const form = new FormData()
  form.append('file', file)
  return httpUpload<MallAsset>(`/assets/${id}/replace`, form)
}

/** DELETE /api/admin/assets/:id */
export async function deleteAsset(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/assets/${id}`)
}
