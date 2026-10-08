import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      'next/link': 'link', 'next/image': 'image', 'next/navigation': 'navigation',
      '@/components/AuthProvider': 'auth', '@/lib/supabaseClient': 'supabase',
      '@/components/GameReviews': 'reviews', '@/components/FavoriteButton': 'favorites',
      '@/components/PlaySessionTracker': 'tracker',
      '@/components/SiteAnalytics': 'analytics',
      '@/lib/profileSync': 'profile',
    }
    if (stubs[specifier]) return { url: `product:${stubs[specifier]}`, shortCircuit: true }
    if (specifier === './MultiplayerProvider') return { url: 'product:multiplayer', shortCircuit: true }
    if (specifier === '../supabaseClient') return { url: 'product:supabase', shortCircuit: true }
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
    const stubs = {
      'product:link': "import {createElement} from 'react'; export default function Link({children, ...props}) {return createElement('a', props, children)}",
      'product:image': "import {createElement} from 'react'; export default function Image({fill,priority,unoptimized,...props}) {return createElement('img', props)}",
      'product:auth': 'export function useAuth() { return globalThis.__productAuth ?? {user:null,session:null,loading:false} }',
      'product:multiplayer': `export function useMultiplayer(){return globalThis.__productMultiplayer ?? {available:true,state:{busy:false,error:'',lobby:null,game:{connected:false,count:0,expected:0,status:''}},controller:{connect:async()=>{throw new Error('Unexpected connection')}}}}`,
      'product:analytics': 'export function suppressLobbyAnalytics(){}',
      'product:navigation': "import {useSyncExternalStore} from 'react'; export function useSearchParams() { const query=useSyncExternalStore(cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)},()=>window.location.search,()=>globalThis.__productSearch ?? '');return new URLSearchParams(query) } export function notFound(){throw new Error('NOT_FOUND')} export function useRouter(){return {push(path){globalThis.__productNavigation=path},replace(path){globalThis.__productNavigation=path}}}",
      'product:profile': 'export async function ensureProfile(){return {ok:true}}',
      'product:reviews': "import {createElement} from 'react';export default function Reviews(){return createElement('section',{'data-testid':'reviews'})}",
      'product:favorites': "import {createElement} from 'react';export default function Favorites(){return createElement('button',null,'Favoris')}",
      'product:tracker': 'export default function Tracker(){return null}',
      'product:supabase': `export const supabase = {
        auth:{signOut:async()=>{},getSession:async()=>({data:{session:globalThis.__productSession ?? null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({data:{session:{user:{id:'A'}}},error:null}),signUp:async input=>{globalThis.__productSignUp=input;return {data:{session:globalThis.__productSession ?? null},error:null}},signInWithOAuth:async input=>{globalThis.__productOAuth=input;return {error:null}}},
        from(table) { const filters=[]; const chain={select(){return chain},eq(key,value){filters.push([key,value]);return chain},order(){return chain},maybeSingle:async()=>({data:null}),then(resolve){const data=table==='games' ? (globalThis.__productRows ?? []).filter(row=>filters.every(([key,value])=>row[key]===value)) : [];return Promise.resolve({data,error:null}).then(resolve)}};return chain },
        rpc:async()=>({data:[],error:null})
      }`,
    }
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
