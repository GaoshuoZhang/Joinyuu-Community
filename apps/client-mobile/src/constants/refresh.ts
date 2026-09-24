/* 下拉刷新指示器统一样式（配合 PullDownRefresh 的 loadingProps 使用）。
 * TDesign Loading 默认 theme=circular 的圆环用 conic-gradient + CSS mask
 * （mask: radial-gradient(transparent calc(50% - 0.5px), #fff 50%)）画 0.5px 发丝圈，
 * 在不支持 CSS mask 的 WebView 上会退化成实心渐变扇形——视觉上只剩一块蓝色楔形，
 * 看不出是加载圈。统一改用 theme=spinner（12 根旋转短线，纯色块、不依赖 mask），
 * 各端渲染一致。 */
export const REFRESH_LOADING_PROPS = { theme: 'spinner' } as const