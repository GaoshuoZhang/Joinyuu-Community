/* API 层通用工具 */

/* 模拟网络延迟的全局系数：调用点的语义时长（300~500ms）统一缩短为实际 120~200ms，
 * 让 loading 可见又不拖沓；M1 接真实接口后删除本函数与所有调用 */
const SPEED_FACTOR = 0.4

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.round(ms * SPEED_FACTOR)))
}
