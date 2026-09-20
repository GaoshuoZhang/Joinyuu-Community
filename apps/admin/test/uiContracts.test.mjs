import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileScript } from 'vue/compiler-sfc'
import { Alert, Button } from 'tdesign-vue-next'
import ts from 'typescript'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.vue') ? [join(directory, entry.name)] : [],
)
const views = files(join(sourceRoot, 'views'))
const lists = views.filter(path => !/Detail|Print|Dashboard|LoginView/.test(path) &&
  /async function load\(/.test(readFileSync(path, 'utf8')))

test('persistent error renders actual TDesign alert and disables retry while loading', async () => {
  const source = readFileSync(join(sourceRoot, 'components/ListErrorState.vue'), 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: 'list-error-test', inlineTemplate: true })
  const js = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(createRequire(import.meta.url), module, module.exports)
  for (const loading of [false, true]) {
    const app = createSSRApp(module.exports.default, { message: '网络异常，请检查网络后重试', loading })
    app.component('t-alert', Alert)
    app.component('t-button', Button)
    const html = await renderToString(app)
    assert.match(html, /role="alert"/)
    assert.match(html, /网络异常，请检查网络后重试/)
    assert.match(html, /重新加载/)
    const button = html.match(/<button\b[^>]*>/)?.[0]
    assert.ok(button)
    assert.equal(/\bdisabled\b/.test(button), loading)
  }
})

test('every standalone list load has a persistent error branch and an in-template retry action', () => {
  assert.equal(lists.length, 45, 'update the inventory deliberately when adding a list')
  for (const path of lists) {
    const source = readFileSync(path, 'utf8')
    const { descriptor, errors } = parse(source)
    const name = relative(sourceRoot, path)
    assert.equal(errors.length, 0, name)
    const script = ts.createSourceFile(name + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
    const load = script.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'load')
    const attempt = load.body.statements.find(ts.isTryStatement)
    assert.ok(attempt?.catchClause?.getText(script).includes('loadError.value ='), name + ': load must preserve its own error')
    assert.match(descriptor.template.content, /<ListErrorState\b[^>]*:message="loadError"[^>]*@retry=/, name + ': retry must be inside template')
  }
})

test('all query-object lists install URL state during setup, not inside onMounted', () => {
  let checked = 0
  for (const path of views) {
    const source = readFileSync(path, 'utf8')
    if (!/const query = reactive\(/.test(source)) continue
    const { descriptor } = parse(source)
    const script = ts.createSourceFile(path + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
    const installed = script.statements.some(s => ts.isVariableStatement(s) &&
      s.declarationList.declarations.some(d => d.initializer && ts.isCallExpression(d.initializer) &&
        d.initializer.expression.getText(script) === 'useListQueryState'))
    assert.ok(installed, path + ': top-level composable required')
    const load = script.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'load')
    assert.match(load.getText(script), /syncQuery\(\)/, path + ': commit the actual applied query')
    checked++
  }
  assert.equal(checked, 19)
})

test('static placeholders, sensitive settings and simulated navigation stay consistent', () => {
  for (const path of [...views, ...files(join(sourceRoot, 'components')), ...files(join(sourceRoot, 'layouts'))]) {
    const source = readFileSync(path, 'utf8')
    const { descriptor } = parse(source)
    const template = descriptor.template?.content ?? ''
    for (const match of template.matchAll(/(?<!:)\bplaceholder="([^"]+)"/g)) {
      assert.ok(match[1].endsWith('…'), path + ': ' + match[1])
    }
    assert.doesNotMatch(template, /<(?:div|span)\b[^>]*\brole="link"/, path)
  }
  const settings = readFileSync(join(sourceRoot, 'views/system/SystemConfigPanel.vue'), 'utf8')
  for (const key of ['minioAccessKey', 'minioSecretKey']) {
    const tag = settings.match(new RegExp('<t-input\\b[^>]*v-model="form\\.' + key + '"[^>]*>'))?.[0]
    assert.match(tag ?? '', /autocomplete="off"/, key)
  }
})
