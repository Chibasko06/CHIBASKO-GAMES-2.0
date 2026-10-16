import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const within = (file, dir) => file === dir || file.startsWith(dir + sep)
async function files(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...await files(path))
    else if (/\.tsx?$/.test(path)) out.push(path)
  }
  return out
}
const shared = resolve(root, 'shared'), server = resolve(root, 'server')
for (const file of [resolve(root, 'index.ts'), resolve(root, 'definition.ts'), ...await files(shared), ...await files(server), ...await files(resolve(root, 'client')), ...await files(resolve(root, 'local'))]) {
  const source = await readFile(file, 'utf8')
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  function check(node) {
    let specifier
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) specifier = node.moduleSpecifier
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) specifier = node.arguments[0]
    if (specifier) {
      assert.ok(ts.isStringLiteral(specifier), 'No computed import in game runtime: ' + file)
      const value = specifier.text, target = resolve(dirname(file), value)
      let allowed = value.startsWith('.') && within(target, root)
      if (within(file, shared)) allowed = value.startsWith('.') && within(target, shared)
      else if (within(file, server)) allowed ||= ['@chibaskogames/sdk', '@chibaskogames/sdk/server', '@colyseus/schema'].includes(value)
      else if (['client', 'local'].some(folder => within(file, resolve(root, folder)))) allowed ||= ['@chibaskogames/sdk', '@chibaskogames/sdk/client', '@chibaskogames/sdk/react', 'react'].includes(value)
      else allowed ||= value === '@chibaskogames/sdk'
      if (!within(file, server) && within(target, server)) allowed = false
      if (within(file, server) && ['client', 'local'].some(folder => within(target, resolve(root, folder)))) allowed = false
      assert.ok(allowed, 'Forbidden Pong import: ' + value + ' in ' + file)
    }
    ts.forEachChild(node, check)
  }
  check(syntax)
  if (within(file, shared)) assert.doesNotMatch(source, /\b(?:window|document|process|requestAnimationFrame|setInterval)\b|Date\.now\(/)
}
const css = await readFile(resolve(root, 'client/pong.module.css'), 'utf8')
assert.doesNotMatch(css, /@import|@apply|@tailwind|var\(--(?!pong-)/)
console.log('Pong boundaries OK: pure engine, isolated client/server, public SDK only, autonomous CSS.')
