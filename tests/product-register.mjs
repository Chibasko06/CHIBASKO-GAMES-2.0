import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url:'server-only', shortCircuit:true }
    const stubs = {
      'next/link': 'link', 'next/image': 'image', 'next/navigation': 'navigation',
      '@/components/AuthProvider': 'auth', '@/lib/supabaseClient': 'supabase',
      '@/components/GameReviews': 'reviews', '@/components/FavoriteButton': 'favorites',
      '@/components/PlaySessionTracker': 'tracker',
      '@/components/SiteAnalytics': 'analytics',
      '@/lib/profileSync': 'profile', '@/lib/server/supabaseSession': 'serverSession',
    }
    if (stubs[specifier] && !(specifier === '@/components/AuthProvider' && process.env.TEST_PRODUCT_AUTH_PROVIDER)) return { url: `product:${stubs[specifier]}`, shortCircuit: true }
    if (specifier === './supabaseSession' && context.parentURL?.endsWith('/lib/server/onlineGamePage.ts')) return { url: 'product:serverSession', shortCircuit: true }
    if (specifier === './MultiplayerProvider') return { url: 'product:multiplayer', shortCircuit: true }
    if (specifier === '../supabaseClient') return { url: 'product:supabase', shortCircuit: true }
    if (specifier === 'react' || specifier.startsWith('react/')) return nextResolve(specifier, { ...context, parentURL: import.meta.url })
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith(root.href)) {
      for (const ext of ['.ts','.tsx']) { const url = new URL(specifier.slice(0,-3)+ext, context.parentURL); if (existsSync(url)) return {url:url.href,shortCircuit:true} }
    }
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith(root.href))) {
      const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), root) : new URL(specifier, context.parentURL)
      for (const suffix of ['', '.ts', '.tsx']) {
        const url = new URL(base.href + suffix)
        if (existsSync(url) && /\.(tsx?|json|mjs)$/.test(url.pathname)) return { url: url.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context.parentURL?.startsWith('product:') ? { ...context, parentURL: import.meta.url } : context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, {get:(_target,key)=>String(key)})' }
    const stubs = {
      'product:link': "import {createElement} from 'react'; export default function Link({children, ...props}) {return createElement('a', props, children)}",
      'product:image': "import {createElement} from 'react'; export default function Image({fill,priority,unoptimized,...props}) {return createElement('img', props)}",
      'product:auth': 'export function useAuth() { return globalThis.__productAuth ?? {user:null,session:null,loading:false} }',
      'product:multiplayer': `export function useMultiplayer(){return globalThis.__productMultiplayer ?? {available:true,state:{busy:false,error:'',lobby:null,game:{connected:false,count:0,expected:0,status:''}},controller:{connect:async()=>{throw new Error('Unexpected connection')}}}}`,
      'product:serverSession': 'export async function createServerSupabase(){return {auth:{getUser:async()=>({data:{user:globalThis.__productAuth?.user ?? null}})}}}',
      'product:analytics': 'export function suppressLobbyAnalytics(){}',
      'product:navigation': "import {useSyncExternalStore} from 'react'; export function useSearchParams() { const query=useSyncExternalStore(cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)},()=>window.location.search,()=>globalThis.__productSearch ?? '');return new URLSearchParams(query) } export function redirect(path){throw new Error('REDIRECT '+path)} export function notFound(){throw new Error('NOT_FOUND')} const router={push(path){globalThis.__productNavigation=path},replace(path){globalThis.__productNavigation=path}}; export function useRouter(){return router}",
      'product:profile': 'export async function ensureProfile(){return {ok:true}}',
      'product:reviews': "import {createElement} from 'react';export default function Reviews(){return createElement('section',{'data-testid':'reviews'})}",
      'product:favorites': "import {createElement} from 'react';export default function Favorites(){return createElement('button',null,'Favoris')}",
      'product:tracker': 'export default function Tracker(){return null}',
      'product:supabase': `export const supabase = {
        auth:{signOut:async()=>{},getSession:async()=>globalThis.__productGetSession ? globalThis.__productGetSession() : ({data:{session:globalThis.__productSession ?? null}}),onAuthStateChange:cb=>globalThis.__productSubscribe ? globalThis.__productSubscribe(cb) : ({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({data:{session:{user:{id:'A'}}},error:null}),signUp:async input=>{globalThis.__productSignUp=input;return {data:{session:globalThis.__productSession ?? null},error:null}},signInWithOAuth:async input=>{globalThis.__productOAuth=input;return {error:null}}},
        from(table) { const filters=[]; const chain={select(){return chain},eq(key,value){filters.push([key,value]);return chain},order(){return chain},abortSignal(){return chain},maybeSingle:async()=>({data:null}),then(resolve){const data=table==='games' ? (globalThis.__productRows ?? []).filter(row=>filters.every(([key,value])=>row[key]===value)) : table==='categories' ? (globalThis.__productCategories??[]) : table==='game_categories' ? (globalThis.__productCategoryLinks??[]) : [];return Promise.resolve({data,error:null}).then(resolve)}};return chain },
        rpc:async name=>({data:name==='get_published_game_runtimes'?(globalThis.__productRuntimes??[]):[],error:null})
      }; export async function restoreBrowserSession(){return globalThis.__productRestore ? globalThis.__productRestore() : (await supabase.auth.getSession()).data.session}`,
    }
    if (url === 'server-only') return { format:'module', source:'', shortCircuit:true }
    if (stubs[url]) return { format: 'module', source: stubs[url], shortCircuit: true }
    if (url.startsWith(root.href) && /\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    }
    return nextLoad(url, context)
  },
})
