import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

// Run the JS/native launcher directly. Passing an argument array through cmd.exe
// would reinterpret test patterns and other arguments as shell syntax on Windows.
export function packageManagerInvocation(manager, args) {
  if (!['pnpm', 'npm'].includes(manager)) throw new Error(`Unsupported package manager: ${manager}`)
  if (process.platform !== 'win32') return { command: manager, args }
  const current = process.env.npm_execpath
  if (manager === 'pnpm' && current && /pnpm(?:\.c?js|\.exe)$/i.test(current) && existsSync(current)) {
    return current.toLowerCase().endsWith('.exe')
      ? { command: current, args }
      : { command: process.execPath, args: [current, ...args] }
  }
  const directories = [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)].map(value => value.replace(/^"|"$/g, ''))
  for (const directory of directories) {
    const native = join(directory, `${manager}.exe`)
    if (existsSync(native)) return { command: native, args }
    const cli = join(directory, 'node_modules', manager, 'bin', manager === 'npm' ? 'npm-cli.js' : 'pnpm.cjs')
    if (existsSync(cli)) return { command: process.execPath, args: [cli, ...args] }
  }
  throw new Error(`Cannot locate ${manager} launcher; run this script through the installed package manager`)
}
