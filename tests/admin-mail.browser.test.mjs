import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css

const {outputFiles}=await build({
 stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {createRoot} from 'react-dom/client';import AdminMail from './components/admin/AdminMail';createRoot(document.getElementById('root')).render(<AdminMail/>);`},
 bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',
 plugins:[{name:'admin-mail-fixtures',setup(api){
  api.onResolve({filter:/AuthProvider$|^\.\/useAdminAccess$|^\.\/AdminShell$/},({path})=>({path,namespace:'fixture'}))
  api.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'jsx',resolveDir:process.cwd(),contents:
   path.endsWith('AuthProvider')?`export const useAuth=()=>({session:{user:{id:'admin'},access_token:'fixture'}})`:
   path.endsWith('useAdminAccess')?`export const useAdminAccess=()=>({status:'allowed'})`:
   `import React from 'react';export default function Shell({children}){return <main>{children}</main>}`}))
 }}],
})

for(const width of [390,1280])test('mail history confirmation, refresh and failure at '+width,async()=>{
 const browser=await chromium.launch({channel:'chrome'})
 try{
  const page=await browser.newPage({viewport:{width,height:800},colorScheme:width===390?'dark':'light'})
  const id='142d83d5-6e31-4b58-bcc9-9096708e4284'
  const row={id,sender:'contact',recipient:'a@example.test',subject:'Premier envoi',created_at:'2026-11-16T10:00:00Z',status:'accepted'}
  let rows=[row],reads=0,deletions=0,fail=true
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.href==='https://chibaskogames.fr/chibaskogames-email-logo-v2.png')
    return route.fulfill({path:'public/chibaskogames-email-logo-v2.png',contentType:'image/png'})
   if(url.origin!=='https://portal.test')return route.abort()
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>'})
   if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
   if(url.pathname==='/app.js')return route.fulfill({contentType:'application/javascript',body:outputFiles[0].text})
   if(request.method()==='GET'){reads++;return route.fulfill({json:{rows,more:false}})}
   if(request.method()==='DELETE'){
    deletions++;assert.equal(url.searchParams.get('id'),id)
    if(fail)return route.fulfill({status:503,json:{error:'Suppression indisponible.'}})
    rows=[];return route.fulfill({json:{removed:true}})
   }
   rows=[{...row,id:request.postDataJSON().id,subject:'Deuxième envoi'}]
   return route.fulfill({json:{status:'accepted'}})
  })
  await page.goto('https://portal.test')
  const remove=page.getByRole('button',{name:/Supprimer de l’historique/})
  await remove.waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.equal(await page.getByRole('button',{name:'Actualiser'}).count(),0)
  page.once('dialog',dialog=>dialog.dismiss())
  await remove.click()
  assert.equal(deletions,0)
  page.once('dialog',dialog=>dialog.accept())
  await remove.click()
  await page.getByRole('alert').filter({hasText:'Suppression indisponible.'}).waitFor()
  assert.equal(await remove.isVisible(),true)
  fail=false
  const refreshed=page.waitForResponse(response=>response.url().includes('/api/admin/mail?page='))
  page.once('dialog',dialog=>dialog.accept())
  await remove.click()
  await page.getByText('Entrée supprimée de l’historique.').waitFor()
  await remove.waitFor({state:'detached'})
  await refreshed
  assert.ok(reads>=2)
  await page.getByLabel('Destinataire').fill('a@example.test')
  await page.getByLabel('Objet').fill('Deuxième envoi')
  await page.getByLabel('Message').fill('Bonjour Élodie')
  await page.getByRole('button',{name:'Prévisualiser'}).click()
  const preview=page.frameLocator('iframe[title="Rendu HTML de l’e-mail"]')
  const logo=preview.getByRole('img',{name:'Logo Chibasko Games'})
  await logo.waitFor()
  assert.equal(await logo.evaluate(img=>getComputedStyle(img).filter),'none')
  assert.equal(await preview.getByText('Bonjour Élodie').isVisible(),true)
  await page.getByRole('button',{name:'Confirmer et envoyer'}).click()
  await page.getByRole('button',{name:/Supprimer de l’historique : Deuxième envoi/}).waitFor()
  assert.ok(reads>=3)
 }finally{await browser.close()}
})
