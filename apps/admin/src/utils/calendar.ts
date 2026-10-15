/** 按自然租金周期顺延，月底在目标月份截断（1 月 31 日 + 1 月 = 2 月末）。 */
export function addRentPeriod(date: string, period: 'day' | 'week' | 'month' | 'year'): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  if (period === 'day' || period === 'week') target.setDate(day + (period === 'day' ? 1 : 7))
  else {
    target.setDate(1)
    target.setMonth(month - 1 + (period === 'year' ? 12 : 1))
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    target.setDate(Math.min(day, lastDay))
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`
}
