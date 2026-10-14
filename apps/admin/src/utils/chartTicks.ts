/** 计数图使用不重复的整数刻度，同时覆盖所有数据点。 */
export function countAxis(data: number[]) {
  const finite = data.filter(Number.isFinite)
  const low = Math.min(0, ...finite)
  const high = Math.max(1, ...finite)
  const rough = (high - low) / 4
  const power = 10 ** Math.floor(Math.log10(Math.max(1, rough)))
  const step = Math.max(1, ([1, 2, 5, 10].find(value => value * power >= rough) ?? 10) * power)
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step)
  return { min, max, ticks }
}
