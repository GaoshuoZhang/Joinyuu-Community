/* 标签页图标（favicon）共享实现：后台 apps/admin 与客户端 apps/client-mobile 共用，
 * 避免两端各自维护导致策略漂移。
 *
 * 关键点：**不能新增第二个 `link[rel=icon]`**。index.html 内置的是 `image/svg+xml`，
 * 而浏览器（Chrome/Safari）在多个候选图标间会优先选择矢量图标，导致后追加的位图 logo 被忽略
 * ——这正是「上传 logo 对标签页图标无效」的根因。这里统一接管第一个图标节点，其余移除；
 * 清空 logo 时把该节点还原为各端内置图标。 */

/** 扩展名 → MIME：缺失时交给浏览器按内容嗅探（服务端已带正确 Content-Type） */
const ICON_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

function iconMime(url: string): string {
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  return ICON_MIME[ext] ?? ''
}

/** 应用标签页图标：url 为空时回退内置图标（fallbackIcon 由各端按自身产物路径给定） */
export function applyFavicon(url: string | null | undefined, fallbackIcon: string) {
  const head = document.head
  const icons = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
  /* 保留第一个节点作为唯一图标，移除其余候选（内置 SVG 若不移除会压制上传的位图） */
  let link = icons.shift()
  for (const extra of icons) extra.remove()
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    head.appendChild(link)
  }
  const custom = (url ?? '').trim()
  link.href = custom || fallbackIcon
  const type = custom ? iconMime(custom) : 'image/svg+xml'
  if (type) link.setAttribute('type', type)
  else link.removeAttribute('type')
}
