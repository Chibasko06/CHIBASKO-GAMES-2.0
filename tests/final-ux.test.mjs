import test from 'node:test'
import assert from 'node:assert/strict'
import {faqLinks} from '../lib/faqLinks.ts'
import {googleAvatar,googleProfile} from '../lib/googleProfile.ts'
import {POST} from '../app/api/profile/sync/route.ts'
import {adComfortVisible} from '../lib/server/adComfort.ts'

test('FAQ : libellé personnalisé, lien HTTPS direct, ponctuation et retours à la ligne',()=>{
 const parts=faqLinks('Installez [Mon extension](https://github.com/gorhill/uBlock#installation).\nVoir https://example.test/a_(b).')
 assert.deepEqual(parts.filter(part=>part.href),[{text:'Mon extension',href:'https://github.com/gorhill/uBlock#installation'},{text:'https://example.test/a_(b)',href:'https://example.test/a_(b)'}])
 assert.equal(parts.map(part=>part.text).join(''),'Installez Mon extension.\nVoir https://example.test/a_(b).')
 assert.deepEqual(faqLinks('Texte normal\nDeuxième ligne'),[{text:'Texte normal\nDeuxième ligne'}])
})
test('FAQ : aucun protocole dangereux, identifiant dans l’URL ou HTML interprété',()=>{
 for(const text of ['[clic](javascript:alert(1))','[clic](data:text/html,test)','[clic](//evil.test)','[clic](https://user:password@example.test)','[clic](https://example.test\\evil)'])assert.equal(faqLinks(text).some(part=>part.href),false)
 assert.equal(faqLinks('<img src=x onerror=alert(1)>')[0].text,'<img src=x onerror=alert(1)>')
})
test('Google : métadonnées et photo limitées au fournisseur déclaré par Auth',()=>{
 assert.deepEqual(googleProfile({app_metadata:{provider:'google'},user_metadata:{full_name:'Joueur Google',avatar_url:'https://lh3.googleusercontent.com/a/avatar'}}),{google:true,name:'Joueur Google',avatar:'https://lh3.googleusercontent.com/a/avatar'})
 assert.equal(googleProfile({app_metadata:{provider:'email'},user_metadata:{avatar_url:'https://lh3.googleusercontent.com/a/avatar'}}).avatar,null)
 for(const value of ['javascript:alert(1)','https://lh3.googleusercontent.com.evil.test/a','https://lh3.googleusercontent.com@evil.test/a','http://lh3.googleusercontent.com/a','https://lh3.googleusercontent.com:8443/a','https://lh3.googleusercontent.com\\@evil.test/a'])assert.equal(googleAvatar(value),null)
})
test('le serveur respecte la fermeture sans réaffichage initial, puis son expiration',async()=>{
 const previous=globalThis.__adminCookies
 try{
  for(const [value,visible] of [[undefined,true],['invalid',true],['Infinity',true],[String(Date.now()-1000),true],[String(Date.now()+86400000),false]]){
   globalThis.__adminCookies={get(name){assert.equal(name,'cg-advice-until');return value?{value}:undefined}}
   assert.equal(await adComfortVisible(),visible)
  }
 }finally{globalThis.__adminCookies=previous}
})
function fixture(existing,metadata={}){
 const writes=[],user={id:'11111111-1111-4111-8111-111111111111',email:'google@example.test',app_metadata:{provider:'google'},user_metadata:{full_name:'Google Player',...metadata}}
 let profile=existing
 const db={auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:true,error:null}),from(){let key;const chain={select(){return chain},eq(value){key=value;return chain},maybeSingle:async()=>({data:key==='username'?null:profile,error:null}),update(value){writes.push(value);profile={...profile,...value};return chain},insert(value){writes.push(value);profile=value;return chain},single:async()=>({data:profile,error:null})};return chain}}
 globalThis.__phase0={admin:db}
 return {writes,request:()=>new Request('https://site.example/api/profile/sync',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:'{}'})}
}
test('route réelle : création Google avec picture de secours, sans copie publique de l’e-mail',async()=>{
 const x=fixture(null,{avatar_url:'https://evil.test/avatar',picture:'https://lh3.googleusercontent.com/a/photo'})
 const response=await POST(x.request());assert.equal(response.status,200)
 assert.equal(x.writes[0].username,'google-player');assert.equal(x.writes[0].avatar_url,'https://lh3.googleusercontent.com/a/photo')
 assert.doesNotMatch(await response.text(),/google@example.test/)
})
test('route réelle : absence de photo, profil personnalisé et photo supprimée restent respectés',async()=>{
 let x=fixture(null);assert.equal((await POST(x.request())).status,200);assert.equal(x.writes[0].avatar_url,null)
 for(const avatar of ['https://assets.chibaskogames.fr/avatars/custom.png',null]){
  x=fixture({id:'11111111-1111-4111-8111-111111111111',username:'mon-pseudo',display_name:'mon-pseudo',bio:null,avatar_url:avatar},{avatar_url:'https://lh3.googleusercontent.com/a/new',bio:'ancienne bio'})
  for(let i=0;i<2;i++){const response=await POST(x.request());assert.equal(response.status,200);assert.equal((await response.json()).profile.avatar_url,avatar)}
  assert.equal(x.writes.length,0)
 }
})
