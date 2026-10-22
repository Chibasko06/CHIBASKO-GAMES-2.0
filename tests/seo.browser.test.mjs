import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from '@playwright/test'

// Real Next production server; browser mutations and third-party tags are blocked.
const port=Number(process.env.SEO_TEST_PORT??3197)
const base=`http://127.0.0.1:${port}`
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'ignore'})
let ready=false
for(let i=0;i<60;i++){
 try{const response=await fetch(base+'/robots.txt');if(response.ok){ready=true;break}}catch{}
 await new Promise(resolve=>setTimeout(resolve,500))
}
if(!ready){server.kill();throw new Error('Local Next server unavailable; run the production build first')}
const browser=await chromium.launch({channel:'chrome',headless:true})
const screenshots=await mkdtemp(join(tmpdir(),'chibasko-seo-'))
console.log('SEO screenshots:',screenshots)
try{
 const context=await browser.newContext()
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url())
  if(request.method()!=='GET')return route.fulfill({status:204,body:''})
  if(url.origin!==base || url.pathname==='/_next/image')return route.abort()
  return route.continue()
 })
 const page=await context.newPage()
 await page.goto(base+'/games')
 const game=await page.locator('a[href^="/games/"]').first().getAttribute('href')
 const category=await page.locator('a[href^="/games?category="]').first().getAttribute('href')
 const artifact=await page.locator('a[href^="/games/"]').filter({hasText:'Chibasko Pong'}).first().getAttribute('href')
 assert.ok(game&&category,'Published catalogue and populated categories must be available')
 assert.ok(artifact,'Published SDK game must be available')
 for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1366,height:768},{width:1920,height:1080}]){
  await test('real Next SEO pages '+viewport.width,async()=>{
   await page.setViewportSize(viewport)
   for(const path of ['/', '/games', category,game,artifact,'/developpeurs','/faq']){
    const response=await page.goto(base+path)
    assert.equal(response.status(),200,path)
    await page.waitForTimeout(300)
    assert.equal(await page.locator('h1').count(),1,path)
    assert.equal(await page.locator('h1').isVisible(),true,path)
    const canonical=await page.locator('link[rel="canonical"]').getAttribute('href')
    assert.equal(new URL(canonical).href,new URL(path,'https://chibaskogames.fr').href,path)
    assert.equal(await page.locator('iframe').count(),0,path)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path)
    const robots=await page.locator('meta[name="robots"]').getAttribute('content')
    assert.ok(!robots.includes('noindex'),path)
    await page.screenshot({path:join(screenshots,(path==='/'?'home':path.replace(/[^a-z0-9]/gi,'_'))+'-'+viewport.width+'.png')})
   }
  })
 }
 await test('real Next private metadata, API headers, query canonical and 404',async()=>{
  for(const path of ['/login','/register','/reset-password','/dashboard','/favorites']){
   await page.goto(base+path)
   assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/,path)
   assert.equal(await page.locator('link[rel="canonical"]').count(),0,path)
  }
  await page.goto(base+'/games?utm_source=seo-fixture')
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://chibaskogames.fr/games')
  const api=await fetch(base+'/api/developer/games')
  assert.match(api.headers.get('x-robots-tag'),/noindex/)
  const missing=await page.goto(base+'/games/seo-fixture-missing-game')
  assert.equal(missing.status(),404)
  assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content'),/noindex/)
 })
 await context.close()
}finally{await browser.close();server.kill()}
