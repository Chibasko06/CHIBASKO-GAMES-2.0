import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const sdk = dirname(fileURLToPath(import.meta.resolve('@chibaskogames/sdk')))
const within = (file, dir) => file === dir || file.startsWith(dir + sep)
const generic = new Set(['react'])
export function allowedGameImport(file, specifier, gameRoot) {
  if (within(file, resolve(root, 'games/chibasko-pong/shared'))) {
    return specifier.startsWith('.') && within(resolve(dirname(file), specifier), resolve(root, 'games/chibasko-pong/shared'))
  }
  if (publicGameExport(specifier, gameRoot)) {
    const server = within(file, resolve(gameRoot, 'server'))
    if (!server && specifier.endsWith('/server')) return false
    if (server && /\/(client|local)$/.test(specifier)) return false
    return true
  }
  if (specifier === '@colyseus/schema') return within(file, resolve(gameRoot, 'server'))
  if (specifier === '@chibaskogames/sdk/server') return within(file, resolve(gameRoot, 'server'))
  if (specifier === '@chibaskogames/sdk' || ['client','react'].some(p => specifier === '@chibaskogames/sdk/' + p)) return true
  if (generic.has(specifier)) return within(file, resolve(gameRoot, 'client')) || within(file, resolve(gameRoot, 'local'))
  const target = resolve(dirname(file), specifier)
  if ((within(file, resolve(gameRoot, 'client')) || within(file, resolve(gameRoot, 'local'))) && within(target, resolve(gameRoot, 'server'))) return false
  if (within(file, resolve(gameRoot, 'server')) && (within(target, resolve(gameRoot, 'client')) || within(target, resolve(gameRoot, 'local')))) return false
  return specifier.startsWith('.') && within(target, gameRoot)
}
export function imports(source) {
  const file = ts.createSourceFile('module.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = []
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) found.push('<non-literal import>')
      else found.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file); return found
}
async function files(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['dist', 'node_modules'].includes(e.name)) continue
    const path = resolve(dir, e.name)
    if (e.isDirectory()) out.push(...await files(path))
    else if (/\.(ts|tsx|js|mjs)$/.test(path)) out.push(path)
  }
  return out
}
export async function checkGameBoundaries() {
  const errors = []
  // Audit the installed distribution; SDK source/tests belong to its own repo.
  const sdkFiles = await files(sdk)
  for (const file of sdkFiles) {
    for (const specifier of imports(await readFile(file, 'utf8'))) {
      const target = resolve(dirname(file), specifier)
      const internal = specifier.startsWith('.') && within(target, sdk)
        && (within(file, resolve(sdk, 'react')) || !within(target, resolve(sdk, 'react')))
      const react = within(file, resolve(sdk, 'react')) && specifier === 'react'
      if (!internal && !react) errors.push(relative(root, file) + ': SDK dependency ' + specifier)
    }
  }
  for (const folder of ['games', 'game-server/src/games']) {
    for (const e of await readdir(resolve(root, folder), { withFileTypes: true })) {
      if (!e.isDirectory() || ['node_modules', 'dist'].includes(e.name)) continue
      const gameRoot = resolve(root, folder, e.name)
      for (const file of await files(gameRoot)) for (const specifier of imports(await readFile(file, 'utf8'))) {
        const tool = within(file, resolve(gameRoot, 'tests')) || within(file, resolve(gameRoot, 'scripts'))
        const own = specifier.startsWith('.') && within(resolve(dirname(file), specifier), gameRoot)
        const toolDependency = specifier.startsWith('node:') || ['react', 'react-dom/client', 'react-dom/server', 'jsdom'].includes(specifier)
          || publicGameExport(specifier, gameRoot)
        const sdkExport = ['@chibaskogames/sdk', ...['client','react','server'].map(name => '@chibaskogames/sdk/' + name)].includes(specifier)
        if (!(tool ? own || toolDependency || sdkExport : allowedGameImport(file, specifier, gameRoot))) errors.push(relative(root, file) + ': forbidden game import ' + specifier)
      }
    }
  }
  // Platform runtime consumes only public package exports, never game source paths.
  const publicPong = new Set(['@chibaskogames/chibasko-pong', ...['client','local','server','shared'].map(name => '@chibaskogames/chibasko-pong/' + name)])
  const platform = [...await files(resolve(root, 'app')), ...await files(resolve(root, 'components')), ...await files(resolve(root, 'lib')),
    ...await files(resolve(root, 'game-server/src')), resolve(root, 'games/clientRegistry.ts')]
  for (const file of platform) for (const specifier of imports(await readFile(file, 'utf8'))) {
    if (specifier.includes('chibasko-pong') && !publicPong.has(specifier)) errors.push(relative(root, file) + ': private Pong import ' + specifier)
  }
  const pongCss = await readFile(resolve(root, 'games/chibasko-pong/client/pong.module.css'), 'utf8')
  if (/@import|@apply|@tailwind|var\(--(?!pong-)/.test(pongCss)) errors.push('Pong styles depend on host CSS')
  if (errors.length) throw new Error(errors.join('\n'))
}
function publicGameExport(specifier, gameRoot) {
  return gameRoot === resolve(root, 'games/chibasko-pong') && ['@chibaskogames/chibasko-pong', ...['client','local','server','shared'].map(name => '@chibaskogames/chibasko-pong/' + name)].includes(specifier)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkGameBoundaries()
  console.log('Game/SDK import boundaries OK (schema is server-only; games cannot depend on Next or platform code).')
}
