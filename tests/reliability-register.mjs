import {registerHooks} from 'node:module'
import {existsSync} from 'node:fs'
await import('./register.mjs')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (['@/lib/supabaseClient','../supabaseClient','./supabaseClient'].includes(specifier)) return {url:'reliability:db',shortCircuit:true}
    if (specifier === '@/lib/server/supabaseSession') return {url:'reliability:serverSession',shortCircuit:true}
    if (specifier === '@/components/AuthProvider') return {url:'reliability:auth',shortCircuit:true}
    if (specifier === 'next/navigation') return {url:'reliability:navigation',shortCircuit:true}
    if (specifier === 'next/link' || specifier === 'next/image') return {url:'reliability:element',shortCircuit:true}
    if (specifier.endsWith('.module.css')) return {url:'reliability:css',shortCircuit:true}
    if (specifier.startsWith('@/')) { const url=new URL('../'+specifier.slice(2)+'.tsx',import.meta.url); if(existsSync(url))return {url:url.href,shortCircuit:true} }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/.test(specifier)) {
      const url=new URL(specifier+'.tsx',context.parentURL)
      if(existsSync(url))return {url:url.href,shortCircuit:true}
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    const stubs = {
      'reliability:serverSession': 'export async function createServerSupabase(){return globalThis.__reliability.db}',
      'reliability:db': 'export const supabase=new Proxy({}, {get:(_,key)=>globalThis.__reliability.db[key]})',
      'reliability:auth': 'export function useAuth(){return globalThis.__reliability.auth}',
      'reliability:navigation': 'export function useRouter(){return globalThis.__reliability.router} export function usePathname(){return "/dashboard"} export function useSearchParams(){return new URLSearchParams()} export function notFound(){throw Error("NOT_FOUND")} export function redirect(path){throw Error("REDIRECT "+path)}',
      'reliability:element': 'import {createElement} from "react"; export default function Element({children,fill,unoptimized,priority,...props}){return createElement(props.href?"a":"img",props,children)}',
      'reliability:css': 'export default new Proxy({}, {get:(_,key)=>String(key)})',
    }
    return stubs[url] ? {format:'module',source:stubs[url],shortCircuit:true} : nextLoad(url,context)
  },
})
