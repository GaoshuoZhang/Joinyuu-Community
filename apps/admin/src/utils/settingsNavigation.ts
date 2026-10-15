import type { LocationQuery, RouteLocationRaw } from 'vue-router'

/** 保留旧书签中的栏目、分页与筛选，迁移到各面板独立的查询参数空间。 */
export function legacySettingsRedirect(path: string, previous: LocationQuery): RouteLocationRaw {
  const query = { ...previous }
  let tab = 'themes'
  if (path === 'messages') {
    tab = 'notifications'
    query.messageTab = previous.tab ?? 'channels'
    for (const key of ['page', 'pageSize', 'status', 'channelKind', 'keyword']) {
      if (query[key] != null) { query[`outbox${key}`] = query[key]; delete query[key] }
    }
  } else if (path === 'trash') {
    tab = 'archive'
    for (const key of ['page', 'pageSize', 'activeDomain', 'keyword']) {
      if (query[key] != null) { query[`archive${key}`] = query[key]; delete query[key] }
    }
  }
  return { path: '/system/config', query: { ...query, tab } }
}
