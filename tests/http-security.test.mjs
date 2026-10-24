import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import config from '../next.config.ts'
import {PORTAL_CSP,PORTAL_SECURITY_HEADERS,securePortalResponse} from '../lib/httpSecurity.mjs'
import {securityHandler} from '../cloudflare/security.mjs'
import {previewHandler} from '../cloudflare/preview.mjs'

test('Next et le Worker utilisent le même socle sans noindex global',async()=>{
  const rules=await config.headers()
  assert.deepEqual(Object.fromEntries(rules.find(rule=>rule.source==='/:path*').headers.map(({key,value})=>[key,value])),PORTAL_SECURITY_HEADERS)
  assert.ok(!rules.find(rule=>rule.source==='/:path*').headers.some(({key})=>key.toLowerCase()==='x-robots-tag'))
  assert.equal(rules.find(rule=>rule.source==='/api/:path*').headers[0].value,'noindex, nofollow')
  const entry=await readFile(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8')
  assert.match(entry,/securityHandler\(previewHandler\(handler\)\)/)
})

test('les pages publiques, privées, erreurs, redirects et assets reçoivent le socle',async()=>{
  const env={},ctx={}
  const handler=securityHandler(previewHandler({async fetch(request,receivedEnv,receivedCtx){
    assert.equal(receivedEnv,env);assert.equal(receivedCtx,ctx)
    const path=new URL(request.url).pathname
    if(path==='/redirect')return Response.redirect('https://chibaskogames.fr/games',302)
    return new Response(path,{status:path==='/missing'?404:path==='/failure'?503:200,headers:{'Content-Type':'text/plain','Cache-Control':'private, no-store'}})
  }}))
  for(const path of ['/','/login','/admin','/api/profile/public','/missing','/failure','/redirect','/robots.txt','/ads.txt','/_next/static/chunk.js']){
    const response=await handler.fetch(new Request('https://chibaskogames.fr'+path),env,ctx)
    for(const [name,value]of Object.entries(PORTAL_SECURITY_HEADERS))assert.equal(response.headers.get(name),value,path)
    assert.equal(response.headers.get('strict-transport-security'),'max-age=86400')
    assert.equal(response.headers.get('x-robots-tag'),null)
    if(path==='/redirect')assert.equal(response.headers.get('location'),'https://chibaskogames.fr/games')
    else {assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(await response.text(),path)}
  }
})

test('les protections preview et les restrictions propres aux routes sont conservées',async()=>{
  const headers=new Headers({'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','Cache-Control':'private, no-store','Vary':'Cookie, Authorization','X-Request-Id':'fixture'})
  headers.append('Set-Cookie','first=1; Secure; HttpOnly');headers.append('Set-Cookie','second=2; Secure; HttpOnly')
  const response=securePortalResponse(new Request('https://chibaskogames.fr/api/fixture'),new Response('private',{status:401,headers}))
  assert.equal(response.status,401);assert.equal(response.headers.get('vary'),'Cookie, Authorization')
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/)
  assert.ok(response.headers.get('content-security-policy').includes(PORTAL_CSP))
  assert.equal(response.headers.get('referrer-policy'),'no-referrer')
  assert.equal(response.headers.get('x-robots-tag'),'noindex');assert.equal(response.headers.get('x-request-id'),'fixture')
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.getSetCookie().length,2)
  const preview=await securityHandler(previewHandler({fetch:async()=>new Response('page')})).fetch(new Request('https://preview.workers.dev/robots.txt'),{}, {})
  assert.equal(await preview.text(),'User-agent: *\nDisallow: /\n')
  assert.equal(preview.headers.get('x-robots-tag'),'noindex, nofollow, noarchive')
  assert.equal(preview.headers.get('x-frame-options'),'DENY')
})

test('HSTS ne dépend ni des headers forwarded ni du domaine canonique configuré',()=>{
  for(const url of ['http://chibaskogames.fr/','https://localhost/','https://preview.workers.dev/','https://chibaskogames.fr.example.org/']){
    const response=securePortalResponse(new Request(url,{headers:{'X-Forwarded-Host':'chibaskogames.fr','X-Forwarded-Proto':'https'}}),new Response(null,{status:204}))
    assert.equal(response.status,204);assert.equal(response.headers.get('strict-transport-security'),null)
  }
  assert.equal(securePortalResponse(new Request('https://www.chibaskogames.fr/'),new Response()).headers.get('strict-transport-security'),'max-age=86400')
})

test('le socle est idempotent et préserve le contenu, les flux et les politiques TLS existantes',async()=>{
  const request=new Request('https://chibaskogames.fr/')
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('streamed'));controller.close()}})
  const once=securePortalResponse(request,new Response(stream,{headers:{'Content-Type':'text/html','Strict-Transport-Security':'max-age=31536000'}}))
  const twice=securePortalResponse(request,once)
  assert.equal(twice.headers.get('content-security-policy'),PORTAL_CSP)
  assert.equal(twice.headers.get('strict-transport-security'),'max-age=31536000')
  assert.equal(twice.headers.get('content-type'),'text/html');assert.equal(await twice.text(),'streamed')
})

test('le socle ne restreint pas le chargement des scripts, connexions et iframes des jeux',()=>{
  assert.deepEqual(PORTAL_CSP.split(';').map(value=>value.trim()),["frame-ancestors 'none'","base-uri 'self'","object-src 'none'"])
  assert.ok(!Object.keys(PORTAL_SECURITY_HEADERS).some(name=>['Permissions-Policy','Cross-Origin-Embedder-Policy','Cross-Origin-Opener-Policy'].includes(name)))
})
