import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer as httpsServer} from 'node:https'
import {createServer as httpServer} from 'node:http'
import {connect} from 'node:net'
import {readFileSync} from 'node:fs'
import {chromium,firefox,webkit} from '@playwright/test'
import {prepareBrowserHTTPS} from '../scripts/prepare-browser-https.mjs'

const cookies={
 full:'__Host-probe=fixture; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=86400',
 unpartitioned:'__Host-probe=fixture; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=86400',
 plain:'probe=fixture; Path=/; Secure; SameSite=Lax',
}

test('Cookies : comparaison HTTPS local et interception, sans accès externe',{timeout:180000},async()=>{
 prepareBrowserHTTPS()
 const engine=process.env.RUNTIME_BROWSER_ENGINE??'webkit',type={chromium,firefox,webkit}[engine]
 assert.ok(type,'Moteur inconnu')
 const hosts=new Set(['portal.test','game.test','one.play.test','portal.play.test','chibaskogames.fr','g-00000000000040008000000000000001.chibaskogames-play.fr','portal.chibaskogames-play.fr'])
 let port
 function serve(url,headers){
  const responseHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
  if(url.pathname==='/read')return {status:200,headers:{...responseHeaders,'Content-Type':'application/json'},body:JSON.stringify({cookiePresent:/\b(?:__Host-)?probe=fixture(?:;|$)/.test(headers.cookie??'')})}
  if(url.pathname==='/set'){
   responseHeaders['Set-Cookie']=cookies[url.searchParams.get('kind')]
   responseHeaders['Content-Security-Policy']="default-src 'none'; connect-src 'self'; "+(url.searchParams.get('sandbox')==='off'?'':'sandbox allow-scripts allow-same-origin allow-pointer-lock; ')+"frame-ancestors "+['portal.test','portal.play.test','chibaskogames.fr','portal.chibaskogames-play.fr'].map(host=>'https://'+host+':'+port).join(' ')
   return {status:200,headers:responseHeaders,body:'<!doctype html><title>Cookie de test</title>'}
  }
  if(url.pathname!=='/host')return {status:404,headers:responseHeaders,body:''}
  const child=new URL(url.searchParams.get('child'))
  assert.ok(hosts.has(child.hostname)&&child.protocol==='https:'&&child.port===String(port))
  return {status:200,headers:responseHeaders,body:'<!doctype html><title>Hôte de test</title><iframe '+(url.searchParams.get('sandbox')==='off'?'':'sandbox="allow-scripts allow-same-origin allow-pointer-lock" ')+'src="'+child.href.replaceAll('&','&amp;')+'"></iframe>'}
 }
 const server=httpsServer({key:readFileSync('.distribution/cookie-lab/key.pem'),cert:readFileSync('.distribution/cookie-lab/cert.pem')},(req,res)=>{
  const result=serve(new URL(req.url,'https://'+req.headers.host),req.headers);res.writeHead(result.status,result.headers);res.end(result.body)
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port
 const proxy=httpServer((_req,res)=>{res.writeHead(403);res.end()})
 proxy.on('connect',(req,socket,head)=>{
  const address=new URL('https://'+req.url)
  if(!hosts.has(address.hostname)||address.port!==String(port)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return}
  const upstream=connect(port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)})
  socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy())
 })
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve))
 let browser;const results=[]
 try{
  browser=await type.launch({headless:true,proxy:{server:'http://127.0.0.1:'+proxy.address().port},...(engine==='chromium'?{channel:'chrome'}:{})})
  for(const transport of ['https','intercepted'])for(const contextKind of ['first-party','same-site','cross-site','same-site-real','cross-site-real','cross-site-unsandboxed'])for(const kind of contextKind==='first-party'?['plain','full']:['full','unpartitioned']){
   // Seul le certificat auto-signé du serveur de laboratoire est ignoré.
   // Aucun réglage de confidentialité ou de cookie du navigateur n'est modifié.
   const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'})
   try{
    if(transport==='intercepted')await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());assert.ok(hosts.has(url.hostname));await route.fulfill(serve(url,await request.allHeaders()))})
    const real=contextKind.endsWith('-real'),same=contextKind.startsWith('same-site'),childHost=real?'g-00000000000040008000000000000001.chibaskogames-play.fr':same?'one.play.test':'game.test',parentHost=real?(same?'portal.chibaskogames-play.fr':'chibaskogames.fr'):same?'portal.play.test':'portal.test'
    const page=await context.newPage(),child='https://'+childHost+':'+port+'/set?kind='+kind+(contextKind==='cross-site-unsandboxed'?'&sandbox=off':'')
    await page.goto(contextKind==='first-party'?child:'https://'+parentHost+':'+port+'/host?child='+encodeURIComponent(child)+(contextKind==='cross-site-unsandboxed'?'&sandbox=off':''))
    const frame=contextKind==='first-party'?page.mainFrame():await (await page.locator('iframe').elementHandle()).contentFrame()
    await frame.waitForLoadState('load')
    const result=await frame.evaluate(async()=>({secureContext:isSecureContext,...await(await fetch('/read')).json()}))
    results.push({engine,version:browser.version(),transport,context:contextKind,cookie:kind,...result})
   }finally{await context.close()}
  }
  for(const row of results)console.log('COOKIE_MATRIX '+JSON.stringify(row))
  assert.ok(results.filter(r=>r.cookie==='full').every(r=>r.cookiePresent),'Au moins un contexte ne transmet pas le cookie de production ; consulter la matrice complète.')
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>proxy.close(resolve))}
})
