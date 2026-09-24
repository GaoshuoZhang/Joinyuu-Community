#!/usr/bin/env node
/* 排版 Token First 校验
 *
 * 规则：字号 / 字重 / 行高 / 字体栈只允许整体引用 L2 角色档 —— `font: var(--app-type-*)`。
 * 禁止（任何含字面量的写法也在禁止之列）：
 *   font-size / font-weight / line-height / font-family 单独声明
 *   font: 非 var(--app-type-*)
 * 即「不要按看起来差不多的 px 随手挑一个」：复合简写里没有单独挑字号/字重的位置。
 *
 * 豁免：
 *   1) 文件级：src/styles/tokens.css（L1/L2/L3 定义处）；
 *   2) 单条：声明所在行注释 `星号 typography-token-exempt: 原因`（TDesign 内部类覆盖、
 *      SVG 文本等确无角色档可用的场景，原因里写明升级复核点）。
 *
 * 迁移基线（保留机制，当前已清空）：scripts/typography-allowlist.txt 形如 `<相对路径>\t<违规条数>`。
 *   - 实际违规 > 基线 → 拦截（迁移期新增违规也会被抓到）；
 *   - 实际违规 < 基线 → 提示可下调基线；每完成一批就下调，归零后删除该行。
 *   2026-09-25 全量迁移完成，基线文件已删除（无文件即视为基线为空，任何违规都会拦截）。
 *
 * 用法：
 *   node scripts/check-typography.mjs                   校验（阻断项退出码 1）
 *   node scripts/check-typography.mjs --list            只列出全部违规位置
 *   node scripts/check-typography.mjs --write-allowlist  按当前状态重写基线（再次批量迁移时使用）
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const ALLOWLIST = fileURLToPath(new URL('./typography-allowlist.txt', import.meta.url))
const EXEMPT_FILES = new Set(['styles/tokens.css'])
const BANNED_PROPS = 'font-size|font-weight|line-height|font-family'
const ROLE_VALUE = /^var\(--app-type-[a-z0-9-]+\)$/
const WRITE_MODE = process.argv.includes('--write-allowlist')
/** --list：只打印全部违规文件与条数（迁移时用来确认某批文件是否已清空），不做基线判定 */
const LIST_MODE = process.argv.includes('--list')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.vue') || path.endsWith('.css')) out.push(path)
  }
  return out
}

/** 注释替换为等长空白（保留换行），保证偏移量与原文行号一致 */
const blankComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

const DECL_RE = new RegExp(`(?:^|[;{}\\n])\\s*(${BANNED_PROPS}|font)\\s*:\\s*([^;{}]*)`, 'g')

const files = walk(SRC)
const violations = []

for (const file of files) {
  const rel = relative(SRC, file).split(sep).join('/')
  if (EXEMPT_FILES.has(rel)) continue
  const raw = readFileSync(file, 'utf8')
  const text = blankComments(raw)
  let m
  while ((m = DECL_RE.exec(text))) {
    const prop = m[1]
    const value = m[2].trim().replace(/\s+/g, ' ')
    /* 匹配起点落在「上一个分隔符」（; { } 或换行）上，故声明自身的行号要按属性名位置算；
     * 豁免注释允许写在声明所在行或紧邻上一行（多行格式下注释常贴在上一行行尾） */
    const propOffset = m.index + m[0].indexOf(prop)
    const declLine = text.slice(0, propOffset).split('\n').length
    const rawLines = raw.split('\n')
    const lineText = [rawLines[declLine - 1] ?? '', rawLines[declLine - 2] ?? ''].join('\n')
    if (lineText.includes('typography-token-exempt')) continue
    if (prop === 'font' && ROLE_VALUE.test(value)) continue
    violations.push({ rel, line: declLine, prop, value: value.slice(0, 70) })
  }
}

const byFile = new Map()
for (const v of violations) byFile.set(v.rel, [...(byFile.get(v.rel) ?? []), v])

if (LIST_MODE) {
  for (const [rel, list] of [...byFile].sort()) console.log(`${rel}\t${list.length}`)
  console.log(`# 共 ${byFile.size} 个文件、${violations.length} 处`)
  process.exit(0)
}

if (WRITE_MODE) {
  const lines = [
    '# 排版 Token First 迁移基线：<相对路径> → <当前违规条数>',
    '# 规则：只能写 `font: var(--app-type-*)`；基线用于记录待迁移存量。',
    '# 实际违规多于基线会拦截（防止迁移期新增），少于基线提示下调；归零后删除该行。',
    '',
  ]
  for (const [rel, list] of [...byFile].sort()) lines.push(`${rel}\t${list.length}`)
  writeFileSync(ALLOWLIST, `${lines.join('\n')}\n`, 'utf8')
  console.log(`已写入基线：${byFile.size} 个文件、${violations.length} 处待迁移声明`)
  process.exit(0)
}

const baseline = new Map()
if (existsSync(ALLOWLIST)) {
  for (const line of readFileSync(ALLOWLIST, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [rel, count] = t.split('\t')
    baseline.set(rel.trim(), Number(count ?? 0))
  }
}

let pending = 0
const blocking = []
const shrinkable = []
for (const [rel, list] of byFile) {
  const base = baseline.get(rel) ?? 0
  if (list.length > base) blocking.push(...list.slice(base))
  else if (list.length === base) pending += list.length
  else shrinkable.push(`${rel}（基线 ${base} → 实际 ${list.length}，可下调）`)
}
for (const rel of baseline.keys()) if (!byFile.has(rel)) shrinkable.push(`${rel}（基线 ${baseline.get(rel)} → 实际 0，可删除该行）`)

console.log(`排版校验：扫描 ${files.length} 个文件，命中 ${violations.length} 处待迁移声明`)
if (pending) console.log(`迁移存量（在基线内，不拦截）：${pending} 处 / ${byFile.size} 个文件`)
if (shrinkable.length) console.log(`可更新基线：${shrinkable.slice(0, 5).join('、')}${shrinkable.length > 5 ? ` 等 ${shrinkable.length} 项` : ''}`)

if (blocking.length) {
  console.error('\n以下声明必须改写为 `font: var(--app-type-*)`（或加 typography-token-exempt 说明）：')
  const grouped = new Map()
  for (const v of blocking) grouped.set(v.rel, [...(grouped.get(v.rel) ?? []), v])
  for (const [rel, list] of grouped) {
    console.error(`\n  ${rel}`)
    for (const v of list) console.error(`    ${v.line}:${v.prop}: ${v.value}`)
  }
  console.error(`\n共 ${blocking.length} 处超出基线（含迁移期新增）。`)
  process.exit(1)
}

console.log('✔ 无超出基线的排版声明')