import { randomInt } from 'node:crypto'

/** 去除易混淆字符（0/O/1/I） */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 生成 4 位验证码与 SVG dataURL（由后端生成） */
export function buildCaptcha(): { code: string; image: string } {
  let code = ''
  for (let i = 0; i < 4; i++) code += CHARS[randomInt(0, CHARS.length)]

  const width = 110
  const height = 38
  const chars = code
    .split('')
    .map((c, i) => {
      const x = 20 + i * 24
      const y = 26 + randomInt(-2, 3)
      const rotate = randomInt(-18, 19)
      return `<text x="${x}" y="${y}" font-size="22" font-family="monospace" font-weight="bold" fill="#0052D9" transform="rotate(${rotate} ${x} ${y})">${c}</text>`
    })
    .join('')
  const lines = Array.from({ length: 3 })
    .map(() => {
      const x1 = randomInt(0, width)
      const y1 = randomInt(0, height)
      const x2 = randomInt(0, width)
      const y2 = randomInt(0, height)
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c7d5ea" stroke-width="1"/>`
    })
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#eef2f7" rx="6"/>${lines}${chars}</svg>`
  return { code, image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }
}
