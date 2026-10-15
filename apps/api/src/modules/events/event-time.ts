import { BadRequestException } from '@nestjs/common'

function validTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return false
  const date = new Date(value.replace(' ', 'T'))
  if (!Number.isFinite(date.getTime())) return false
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}` === value
}

export function validateEventTimes(payload: { startTime: string; endTime: string; enrollmentDeadline?: string }) {
  if (!validTime(payload.startTime) || !validTime(payload.endTime)) {
    throw new BadRequestException('活动时间须为有效的 YYYY-MM-DD HH:mm 日期时间')
  }
  if (payload.endTime <= payload.startTime) throw new BadRequestException('活动结束时间须晚于开始时间')
  if (payload.enrollmentDeadline && (!validTime(payload.enrollmentDeadline) || payload.enrollmentDeadline > payload.startTime)) {
    throw new BadRequestException('报名截止时间须为有效时间，且不能晚于活动开始时间')
  }
}
