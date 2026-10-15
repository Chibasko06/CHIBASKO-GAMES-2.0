import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const sdk = resolve(root, 'packages/game-sdk/src')
const within = (file, dir) => file === dir || file.startsWith(dir + sep)
const generic = new Set(['react', 'next/image', '@colyseus/schema'])
export function allowedGameImport(file, specifier, gameRoot) {
  if (within(file, resolve(root, 'games/chibasko-pong/shared'))) {
    return specifier.startsWith('.') && within(resolve(dirname(file), specifier), resolve(root, 'games/chibasko-pong/shared'))
  }
  if (specifier === '@chibaskogames/pong-engine') return gameRoot === resolve(root, 'game-server/src/games/chibasko-pong')
  if (specifier === '@chibaskogames/sdk' || ['client','react','server'].some(p => specifier === '@chibaskogames/sdk/' + p)) return true
  if (generic.has(specifier)) return true
  return specifier.startsWith('.') && within(resolve(dirname(file), specifier), gameRoot)
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
  for (const file of await files(sdk)) {
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
      if (!e.isDirectory()) continue
      const gameRoot = resolve(root, folder, e.name)
      for (const file of await files(gameRoot)) for (const specifier of imports(await readFile(file, 'utf8'))) {
        if (!allowedGameImport(file, specifier, gameRoot)) errors.push(relative(root, file) + ': forbidden game import ' + specifier)
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkGameBoundaries()
  console.log('Game/SDK import boundaries OK (next/image and schema are explicit extraction debts).')
}
