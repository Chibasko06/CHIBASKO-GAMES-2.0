// Run application TypeScript with Node's test runner, without a new dependency.
import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server' && process.env.TEST_REAL_ADMIN) return { url: new URL('tests/admin-next.mjs', root).href, shortCircuit: true }
    const stubs = {
      'next/server': 'next',
      'server-only': 'server-only',
      'next/headers': 'headers',
      'next/navigation': 'navigation',
      '@/lib/supabaseAdmin': 'supabase',
      resend: 'resend',
      '@opennextjs/cloudflare': 'cloudflare',
    }
    if (!process.env.TEST_REAL_ADMIN && specifier.endsWith('_utils') && (context.parentURL?.includes('/app/api/admin/games/')
      || context.parentURL?.includes('/app/api/admin/users/'))) {
      return { url: 'phase0:admin-check', shortCircuit: true }
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
      'phase0:cloudflare': 'export function getCloudflareContext() { return { env: { CHIBASKO_ASSETS: globalThis.__r2.bucket } } }',
      'phase0:admin-check': 'export function requireAdmin(request) { return globalThis.__r2.adminCheck(request) } export function adminJson(body,init){return Response.json(body,init)} export function adminErrorMessage(){return "Opération impossible."} export function readAdminJson(request){return request.json()}',
      'phase0:server-only': 'export {}',
      'phase0:headers': 'export async function cookies(){return globalThis.__adminCookies}',
      'phase0:navigation': 'export function redirect(url){throw new Error("REDIRECT "+url)} export function notFound(){throw new Error("NOT_FOUND")}',
    }
    if (stubs[url]) return { format: 'module', source: stubs[url], shortCircuit: true }
    if (url.startsWith(root.href) && /\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
