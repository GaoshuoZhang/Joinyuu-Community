import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const ts = createRequire(resolve(root, 'apps/api/package.json'))('typescript')
const check = process.argv.includes('--check')
function output(name, value) {
  const file = resolve(root, 'docs/backend', name)
  if (check) {
    if (readFileSync(file, 'utf8').replaceAll('\r\n', '\n') !== value) throw new Error(`${name} is stale; run node scripts/generate-reference.mjs`)
  } else writeFileSync(file, value)
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]).sort()
}
function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []
}
function call(decorator, name) {
  const exp = decorator.expression
  return ts.isCallExpression(exp) && exp.expression.getText() === name ? exp : undefined
}
function literal(node) {
  if (!node) return ''
  if (ts.isStringLiteralLike(node)) return node.text
  throw new Error(`Unsupported dynamic route: ${node.getText()}`)
}
const rows = []
for (const file of walk(resolve(root, 'apps/api/src')).filter(p => p.endsWith('.controller.ts'))) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const node of source.statements.filter(ts.isClassDeclaration)) {
    const controller = decorators(node).map(d => call(d, 'Controller')).find(Boolean)
    if (!controller) continue
    const prefix = literal(controller.arguments[0])
    for (const member of node.members) for (const method of ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'All']) {
      const route = decorators(member).map(d => call(d, method)).find(Boolean)
      if (!route) continue
      const path = '/' + [prefix, literal(route.arguments[0])].filter(Boolean).join('/')
      const src = relative(resolve(root, 'apps/api'), file).replaceAll('\\', '/')
      const line = source.getLineAndCharacterOfPosition(member.getStart()).line + 1
      rows.push({ method: method.toUpperCase(), path, src, line, handler: `${node.name.text}.${member.name.getText()}` })
    }
  }
}
rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
output('routes.md', '# HTTP 路由索引\n\n由 `node scripts/generate-reference.mjs` 从 API 控制器生成；不手工修改。仅列实际声明的路径与处理函数，权限、请求字段和业务规则需查看对应装饰器、DTO 与 Service。\n\n共 ' + rows.length + ' 个路由声明。\n\n| 方法 | 路径 | 处理函数 | 源码 |\n| --- | --- | --- | --- |\n' + rows.map(r => `| ${r.method} | \`${r.path}\` | \`${r.handler}\` | [查看](https://github.com/GaoshuoZhang/Joinyuu-api/blob/main/${r.src}#L${r.line}) |`).join('\n') + '\n')
const schema = readFileSync(resolve(root, 'apps/api/prisma/schema.prisma'), 'utf8').replaceAll('\r\n', '\n')
const models = [...schema.matchAll(/^(model|enum) (\w+) \{[\s\S]*?^\}/gm)]
output('entity-fields.md', '# 数据模型与字段\n\n由 `node scripts/generate-reference.mjs` 从 `apps/api/prisma/schema.prisma` 生成；不手工修改。字段、关系和 Schema 索引如下；数据库 CHECK、触发器和部分索引还需查看 `apps/api/prisma/migrations/`。DTO 校验和权限约束不由本清单替代。\n\n共 ' + models.length + ' 个模型或枚举。\n\n' + models.map(m => `## ${m[2]}\n\n\`\`\`prisma\n${m[0]}\n\`\`\`\n`).join('\n'))
console.log(`Reference ${check ? 'verified' : 'generated'}: ${rows.length} routes, ${models.length} models/enums`)
