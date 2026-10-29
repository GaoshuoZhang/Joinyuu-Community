import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const docs = resolve(root, 'docs')
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)])
}
const files = [...walk(docs).filter(file => file.endsWith('.md')), resolve(root, 'README.md'), resolve(root, 'AGENTS.md')]
for (const id of ['api', 'admin', 'client-mobile', 'wxminiprogram']) {
  const repo = resolve(root, 'apps', id)
  if (!existsSync(repo)) continue // Root CI does not clone business repositories.
  for (const entry of ['README.md', 'AGENTS.md']) if (existsSync(resolve(repo, entry))) files.push(resolve(repo, entry))
}
const errors = []
for (const file of files) {
  const source = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '')
  for (const match of source.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '')
    if (/^(?:[a-z]+:|#)/i.test(target)) continue
    const local = decodeURIComponent(target.split('#')[0])
    if (local && !existsSync(resolve(dirname(file), local))) errors.push(`${relative(root, file)}: missing link ${target}`)
  }
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log(`Documentation links checked: ${files.length} Markdown files`)
