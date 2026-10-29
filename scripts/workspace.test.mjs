import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'joinyuu-workspace-test-'))
  t.after(() => {
    const target = realpathSync(directory)
    assert.ok(target.toLowerCase().startsWith((realpathSync(tmpdir()) + sep).toLowerCase()))
    assert.ok(basename(target).startsWith('joinyuu-workspace-test-'))
    rmSync(target, { recursive: true, force: true })
  })
  const root = join(directory, 'workspace')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  copyFileSync(new URL('./workspace.mjs', import.meta.url), join(root, 'scripts/workspace.mjs'))
  copyFileSync(new URL('./package-manager.mjs', import.meta.url), join(root, 'scripts/package-manager.mjs'))
  writeFileSync(join(root, 'repositories.json'), JSON.stringify({ repositories: [{ id: 'api', path: 'apps/api', remote: null, defaultBranch: 'main', packageManager: 'pnpm' }] }))
  const exec = (command, args, cwd = root) => spawnSync(command, args, { cwd, encoding: 'utf8' })
  const cli = (...args) => exec(process.execPath, ['scripts/workspace.mjs', ...args])
  return { root, directory, exec, cli }
}

test('initialization rejects unknown non-empty directories and path traversal without changing files', t => {
  const f = fixture(t)
  const repo = join(f.root, 'apps/api')
  mkdirSync(repo, { recursive: true })
  writeFileSync(join(repo, 'keep.txt'), 'existing work')
  assert.notEqual(f.cli('init').status, 0)
  assert.equal(readFileSync(join(repo, 'keep.txt'), 'utf8'), 'existing work')
  writeFileSync(join(f.root, 'repositories.json'), JSON.stringify({ repositories: [{ id: 'api', path: '../escape' }] }))
  assert.notEqual(f.cli('init').status, 0)
  assert.equal(existsSync(join(f.directory, 'escape')), false)
})

test('bundle recovery verifies identity, preserves work on repeat initialization, and records only committed releases', t => {
  const f = fixture(t)
  const source = join(f.directory, 'source')
  const bundles = join(f.directory, 'bundles')
  mkdirSync(source)
  mkdirSync(bundles)
  for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'Workspace Test'], ['config', 'user.email', 'workspace-test@example.invalid']]) {
    assert.equal(f.exec('git', args, source).status, 0)
  }
  writeFileSync(join(source, '.joinyuu-repository.json'), JSON.stringify({ id: 'api' }))
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@joinyuu/api', version: '1.0.0' }))
  assert.equal(f.exec('git', ['add', '.'], source).status, 0)
  assert.equal(f.exec('git', ['commit', '-m', 'fixture'], source).status, 0)
  assert.equal(f.exec('git', ['bundle', 'create', join(bundles, 'api.bundle'), '--all'], source).status, 0)
  // An explicit offline recovery must override a configured (unavailable) remote.
  writeFileSync(join(f.root, 'repositories.json'), JSON.stringify({ repositories: [{ id: 'api', path: 'apps/api', remote: join(f.directory, 'missing-remote.git'), defaultBranch: 'main', packageManager: 'pnpm' }] }))
  const init = f.cli('init', '--bundles', bundles)
  assert.equal(init.status, 0, init.stderr)
  const repo = join(f.root, 'apps/api')
  assert.equal(f.exec('git', ['remote'], repo).stdout.trim(), '')
  assert.equal(f.cli('status').status, 0)
  assert.equal(f.cli('record-release', 'baseline').status, 0)
  const release = JSON.parse(readFileSync(join(f.root, 'releases/baseline.json'), 'utf8'))
  assert.equal(release.repositories[0].commit, f.exec('git', ['rev-parse', 'HEAD'], source).stdout.trim())
  assert.notEqual(f.cli('record-release', 'baseline').status, 0)
  writeFileSync(join(repo, 'local-work.txt'), 'do not overwrite')
  assert.equal(f.cli('init', '--bundles', bundles).status, 0)
  assert.equal(readFileSync(join(repo, 'local-work.txt'), 'utf8'), 'do not overwrite')
  assert.notEqual(f.cli('record-release', 'dirty').status, 0)
  assert.equal(existsSync(join(f.root, 'releases/dirty.json')), false)
  writeFileSync(join(repo, '.joinyuu-repository.json'), JSON.stringify({ id: 'wrong' }))
  assert.notEqual(f.cli('init', '--bundles', bundles).status, 0)
})
