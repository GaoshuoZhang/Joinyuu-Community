import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { packageManagerInvocation } from './package-manager.mjs'

const root = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(root, 'repositories.json'), 'utf8'))
const repos = config.repositories
const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value
const directories = new Set()
for (const repo of repos) {
  const directory = resolve(root, repo.path)
  if (!canonical(directory).startsWith(canonical(root + sep)) || directory.includes(`${sep}.git${sep}`) || directories.has(canonical(directory))) {
    throw new Error(`Invalid or duplicate repository path: ${repo.path}`)
  }
  directories.add(canonical(directory))
  repo.directory = directory
}

function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? 'signal'})`)
  return result
}
function git(repo, args, capture = false) {
  const result = run('git', ['-C', repo.directory, ...args], root, capture ? { stdio: 'pipe', encoding: 'utf8' } : {})
  return capture ? result.stdout.trim() : result
}
function assertRepository(repo) {
  if (!existsSync(resolve(repo.directory, '.git'))) throw new Error(`${repo.id}: missing Git repository; run workspace:init`)
  const top = git(repo, ['rev-parse', '--show-toplevel'], true)
  if (canonical(realpathSync(top)) !== canonical(realpathSync(repo.directory))) throw new Error(`${repo.id}: Git root mismatch`)
  const marker = JSON.parse(readFileSync(resolve(repo.directory, '.joinyuu-repository.json'), 'utf8'))
  if (marker.id !== repo.id) throw new Error(`${repo.id}: repository identity mismatch; refusing to modify existing directory`)
}
function packageCommand(repo, args, options = {}) {
  const invocation = packageManagerInvocation(repo.packageManager, args)
  return run(invocation.command, invocation.args, repo.directory, options)
}
function selected(id) {
  const repo = repos.find(item => item.id === id)
  if (!repo) throw new Error(`Unknown repository: ${id}`)
  assertRepository(repo)
  return repo
}
async function startAll(env = process.env) {
  const children = []
  let stopping = false
  function stop(code = 0) {
    if (stopping) return
    stopping = true
    for (const child of children) {
      if (!child.pid || child.exitCode !== null) continue
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
      else child.kill('SIGTERM')
    }
    process.exitCode = code
  }
  process.once('SIGINT', () => stop())
  process.once('SIGTERM', () => stop())
  for (const id of ['api', 'admin', 'client-mobile']) {
    const repo = selected(id)
    const invocation = packageManagerInvocation(repo.packageManager, ['run', 'dev'])
    const child = spawn(invocation.command, invocation.args, { cwd: repo.directory, env, stdio: 'inherit' })
    children.push(child)
    child.on('error', error => { console.error(`${id}: ${error.message}`); stop(1) })
    child.on('exit', code => { if (!stopping) stop(code ?? 1) })
  }
}

const isMain = resolve(process.argv[1] ?? '') === import.meta.filename
const [command, ...args] = isMain ? process.argv.slice(2) : []
if (command === 'init') {
  const bundlesIndex = args.indexOf('--bundles')
  if (bundlesIndex >= 0 && !args[bundlesIndex + 1]) throw new Error('--bundles requires a directory')
  const bundles = bundlesIndex >= 0 ? resolve(args[bundlesIndex + 1]) : null
  for (const repo of repos) {
    if (existsSync(resolve(repo.directory, '.git'))) {
      assertRepository(repo)
      console.log(`${repo.id}: existing repository verified; kept unchanged`)
      continue
    }
    if (existsSync(repo.directory) && readdirSync(repo.directory).length) throw new Error(`${repo.path} is non-empty; refusing to overwrite`)
    const source = bundles ? resolve(bundles, `${repo.id}.bundle`) : repo.remote
    if (!source) throw new Error(`${repo.id}: set remote in repositories.json or pass --bundles <directory>`)
    mkdirSync(resolve(repo.directory, '..'), { recursive: true })
    run('git', ['clone', '--branch', repo.defaultBranch, '--', source, repo.directory])
    assertRepository(repo)
    // Local recovery bundles are not a push destination.
    if (bundles) git(repo, ['remote', 'remove', 'origin'])
  }
} else if (command === 'status') {
  for (const repo of repos) {
    assertRepository(repo)
    console.log(`\n[${repo.id}] ${git(repo, ['branch', '--show-current'], true)} ${git(repo, ['rev-parse', '--short', 'HEAD'], true)} (${repo.path})`)
    const status = git(repo, ['status', '--short'], true)
    console.log(status || 'clean')
    const remotes = git(repo, ['remote'], true).split('\n')
    console.log(remotes.includes('origin') ? `origin: ${git(repo, ['remote', 'get-url', 'origin'], true)}` : 'origin: not configured')
  }
} else if (command === 'install') {
  for (const repo of repos) {
    assertRepository(repo)
    packageCommand(repo, repo.packageManager === 'npm' ? ['ci', '--no-audit', '--no-fund'] : ['install', '--frozen-lockfile'])
  }
} else if (command === 'run') {
  const repo = selected(args[0])
  const task = args[1]
  const pkg = JSON.parse(readFileSync(resolve(repo.directory, 'package.json'), 'utf8'))
  if (!task || !Object.hasOwn(pkg.scripts, task)) throw new Error(`Unknown package script: ${task}`)
  packageCommand(repo, ['run', task])
} else if (['typecheck', 'lint', 'test', 'build', 'check'].includes(command)) {
  const tasks = command === 'check' ? ['typecheck', 'lint', 'test', 'build'] : [command]
  for (const task of tasks) for (const repo of repos) {
    if (repo.id === 'wxminiprogram' && ['typecheck', 'build'].includes(task)) continue
    assertRepository(repo)
    const script = task === 'test' ? ({ api: 'test:unit', admin: 'test:ui' }[repo.id] ?? 'test') : task
    console.log(`\n[${repo.id}] ${script}`)
    packageCommand(repo, ['run', script, ...(repo.id === 'api' && task === 'test' ? ['--runInBand'] : [])])
  }
} else if (command === 'dev') {
  await startAll()
} else if (command === 'record-release') {
  const name = args[0]
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error('Provide a release name containing letters, numbers, dots, underscores or hyphens')
  const path = resolve(root, 'releases', `${name}.json`)
  if (existsSync(path)) throw new Error('Release manifest already exists; choose a new name')
  const entries = repos.map(repo => {
    assertRepository(repo)
    if (git(repo, ['status', '--porcelain'], true)) throw new Error(`${repo.id}: commit changes before recording a release`)
    const pkg = JSON.parse(readFileSync(resolve(repo.directory, 'package.json'), 'utf8'))
    return { id: repo.id, path: repo.path, remote: repo.remote, version: pkg.version, commit: git(repo, ['rev-parse', 'HEAD'], true), tags: git(repo, ['tag', '--points-at', 'HEAD'], true).split('\n').filter(Boolean) }
  })
  mkdirSync(resolve(root, 'releases'), { recursive: true })
  writeFileSync(path, JSON.stringify({ name, createdAt: new Date().toISOString(), status: 'recorded-not-deployed', repositories: entries }, null, 2) + '\n', { flag: 'wx' })
  console.log(`Recorded ${path}; add validation, migration and deployment notes before publishing.`)
} else if (isMain) {
  console.log('Commands: init [--bundles <dir>], status, install, run <repo> <script>, dev, typecheck, lint, test, build, check, record-release <name>')
  if (command) process.exitCode = 1
}

export { startAll }
