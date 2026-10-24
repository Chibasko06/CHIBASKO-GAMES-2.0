import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {chromium} from '@playwright/test'
import {securityHandler} from '../cloudflare/security.mjs'
import {PORTAL_CSP} from '../lib/httpSecurity.mjs'

test('Chrome refuse le portail dans une iframe mais conserve ses jeux et scripts',async()=>{
  let portalOrigin
  const games=createServer((request,response)=>{
    response.setHeader('Content-Type','text/html; charset=utf-8')
    if(request.url==='/attack')response.end(`<iframe id="target" src="${portalOrigin}/"></iframe><script>window.addEventListener('message',event=>{if(event.data==='portal-rendered')window.embedded=true})</script>`)
    else response.end(`<div id="game">${request.url}</div><script>parent.postMessage('game-ready:'+location.pathname,'*')</script>`)
  })
  const address=server=>'http://127.0.0.1:'+server.address().port
  const handler=securityHandler({fetch:async()=>new Response(`<!doctype html><div id="portal">Chibasko Games</div>
    <script>window.portalReady=true;window.childrenReady=[];parent.postMessage('portal-rendered','*');window.addEventListener('message',event=>{if(typeof event.data==='string'&&event.data.startsWith('game-ready:'))window.childrenReady.push(event.data)})</script>
    <iframe id="legacy" src="${address(games)}/legacy"></iframe><iframe id="sdk" src="${address(games)}/sdk"></iframe>`,{headers:{'Content-Type':'text/html; charset=utf-8'}})})
  const portal=createServer(async(request,response)=>{
    try{
      const result=await handler.fetch(new Request(portalOrigin+request.url),{}, {})
      response.writeHead(result.status,Object.fromEntries(result.headers))
      response.end(Buffer.from(await result.arrayBuffer()))
    }catch{response.writeHead(500);response.end()}
  })
  let browser
  try{
    await new Promise(resolve=>games.listen(0,'127.0.0.1',resolve))
    await new Promise(resolve=>portal.listen(0,'127.0.0.1',resolve));portalOrigin=address(portal)
    browser=await chromium.launch({channel:process.env.RUNTIME_BROWSER_CHANNEL??'chrome',headless:true})
    const page=await browser.newPage()
    const response=await page.goto(portalOrigin)
    assert.equal(response.headers()['content-security-policy'],PORTAL_CSP)
    await page.waitForFunction(()=>window.portalReady&&window.childrenReady.length===2)
    assert.equal(await page.locator('#legacy').contentFrame().locator('#game').textContent(),'/legacy')
    assert.equal(await page.locator('#sdk').contentFrame().locator('#game').textContent(),'/sdk')
    const blocked=page.waitForEvent('console',{predicate:message=>/frame-ancestors|X-Frame-Options/i.test(message.text()),timeout:5000})
    await page.goto(address(games)+'/attack');await blocked
    assert.equal(await page.evaluate(()=>Boolean(window.embedded)),false)
    await page.close()
  }finally{
    await browser?.close()
    await Promise.all([games,portal].map(server=>new Promise(resolve=>server.close(resolve))))
  }
})
