import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,readdir,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {chromium} from '@playwright/test'
import Guide from '../app/developpeurs/page.tsx'
import Privacy from '../app/confidentialite/page.tsx'
import Cookies from '../app/cookies/page.tsx'
import Legal from '../app/mentions-legales/page.tsx'
const pages={'/developpeurs':Guide,'/confidentialite':Privacy,'/cookies':Cookies,'/mentions-legales':Legal}
async function cssFiles(directory){const files=[];for(const item of await readdir(directory,{withFileTypes:true})){const path=join(directory,item.name);if(item.isDirectory())files.push(...await cssFiles(path));else if(item.name.endsWith('.css'))files.push(path)}return files}
const css=(await Promise.all((await cssFiles('.next/static')).map(path=>readFile(path,'utf8')))).join('\n')
assert.ok(css,'Run the Next build before the documentation browser check')
const server=createServer((request,response)=>{if(request.url==='/styles.css'){response.setHeader('Content-Type','text/css');response.end(css);return}const component=pages[request.url];if(!component){response.writeHead(404);response.end();return}response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="bg-zinc-950 p-4 text-white">'+renderToStaticMarkup(createElement(component))+'</body></html>')})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({channel:'chrome',headless:true})
const screenshots=await mkdtemp(join(tmpdir(),'chibasko-developer-guide-'))
console.log('Documentation screenshots:',screenshots)
try{
 for(const viewport of [{width:1366,height:768},{width:390,height:844}])await test('Chrome developer/legal pages '+viewport.width,async()=>{
  const page=await browser.newPage({viewport})
  for(const path of Object.keys(pages)){
   await page.goto('http://127.0.0.1:'+server.address().port+path)
   assert.equal(await page.locator('h1').isVisible(),true)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path)
   assert.equal(await page.getByRole('navigation',{name:'Sommaire'}).isVisible(),true)
  }
  await page.goto('http://127.0.0.1:'+server.address().port+'/developpeurs')
  await page.screenshot({path:join(screenshots,'guide-'+viewport.width+'.png')})
  await page.getByRole('link',{name:'5. Contrôle audio SDK',exact:true}).click();assert.equal(await page.locator('#audio').isVisible(),true)
  await page.getByText('Audio désactivé',{exact:true}).click();assert.equal(await page.locator('details[open]').count(),1)
  await page.locator('pre').first().focus();assert.equal(await page.locator('pre').first().evaluate(node=>document.activeElement===node),true)
  assert.equal(await page.getByRole('link',{name:'Publier un jeu',exact:true}).first().getAttribute('href'),'/publier-un-jeu')
  await page.close()
 })
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
