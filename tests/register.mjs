// Run application TypeScript with Node's test runner, without a new dependency.
import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      'next/server': 'next',
      '@/lib/supabaseAdmin': 'supabase',
      resend: 'resend',
    }
    if (stubs[specifier]) return { url: `phase0:${stubs[specifier]}`, shortCircuit: true }
    if (specifier.startsWith('@/')) {
      return { url: new URL(`${specifier.slice(2)}.ts`, root).href, shortCircuit: true }
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    const stubs = {
      'phase0:next': 'export const NextResponse = Response; export function after(task) { globalThis.__phase0.after.push(task) }',
      'phase0:supabase': 'export function getSupabaseAdminClient() { return globalThis.__phase0.admin }',
      'phase0:resend': 'export class Resend { emails = { send: (...args) => globalThis.__phase0.send(...args) } }',
    }
    if (stubs[url]) return { format: 'module', source: stubs[url], shortCircuit: true }
    if (url.startsWith(root.href) && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
