import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import RoleBadges from '../components/RoleBadges.tsx'
import PlayersPage from '../app/players/page.tsx'
import {getCommunityProfilesPage,getPublicProfiles,getPublicProfilesPage,getPublicProfileIds,getPublicProfileById,getPublicProfileByUsername} from '../lib/queries/profiles.ts'

const profile={id:'11111111-1111-4111-8111-111111111111',username:'Membre',avatar_url:null,bio:null,created_at:'2026-01-01',roles:{admin:false,developer:true}}

test('la projection des profils transmet recherche, pagination et rôle sans charger tout l’annuaire',async()=>{
 let request
 globalThis.__reliability={db:{rpc:async(name,args)=>{request={name,args};return {data:{total:1205,items:[profile]},error:null}}}}
 const result=await getCommunityProfilesPage('Membre',3,'developer')
 assert.deepEqual(request,{name:'public_profiles_page',args:{p_search:'Membre',p_page:3,p_role:'developer',p_id:null}})
 assert.equal(result.total,1205);assert.equal(result.items.length,1)
})

test('les clés supplémentaires ne sont jamais transmises aux cartes publiques',async()=>{
 globalThis.__reliability={db:{rpc:async()=>({data:{total:1,items:[{...profile,email:'private@example.test',contact_email:'private@example.test',roles:{...profile.roles,secret:'private'}}]},error:null})}}
 const result=await getCommunityProfilesPage()
 assert.deepEqual(result.items,[profile]);assert.doesNotMatch(JSON.stringify(result),/private|secret|email/)
})

test('absence réelle, panne et contrat incomplet sont distingués',async()=>{
 for(const data of [null,{items:[null],total:1},{items:[{...profile,roles:undefined}],total:1},{items:[],total:-1}]){
  globalThis.__reliability={db:{rpc:async()=>({data,error:null})}}
  await assert.rejects(getCommunityProfilesPage(),{name:'DataAccessError'})
 }
 globalThis.__reliability={db:{rpc:async()=>({data:{items:[],total:0},error:null})}}
 assert.deepEqual(await getCommunityProfilesPage(),{items:[],total:0})
 globalThis.__reliability.db.rpc=async()=>({data:null,error:{code:'08006',message:'private SQL'}})
 await assert.rejects(getCommunityProfilesPage(),error=>error.name==='DataAccessError'&&!error.message.includes('private SQL'))
})

test('les badges sont exclusivement dérivés des deux statuts confirmés',()=>{
 for(const admin of [false,true])for(const developer of [false,true]){
  const html=renderToStaticMarkup(createElement(RoleBadges,{roles:{admin,developer}}))
  assert.equal(html.includes('ADMIN'),admin);assert.equal(html.includes('DÉVELOPPEUR'),developer)
  assert.equal((html.match(/aria-hidden="true"/g)??[]).length,Number(admin)+Number(developer))
 }
 assert.equal(renderToStaticMarkup(createElement(RoleBadges)), '')
})

test('la Communauté ne charge aucun annuaire sans recherche ciblée et reste publique pour les invités',async()=>{
 let calls=0
 globalThis.__reliability={auth:{user:null,session:null,loading:false},db:{async rpc(name,args){calls++;assert.equal(name,'public_profiles_page');assert.equal(args.p_search,'membre');return {data:{items:[profile],total:1},error:null}}}}
 for(const search of ['', ' ', '@', '@@', 'ab', 'a b']){
  const html=renderToStaticMarkup(await PlayersPage({searchParams:Promise.resolve({search})}))
  assert.match(html,/Communauté/);assert.match(html,/Se connecter/);assert.equal(calls,0)
  assert.doesNotMatch(html,/Demandes reçues|Mes amis|Ajouter en ami/)
 }
 const html=renderToStaticMarkup(await PlayersPage({searchParams:Promise.resolve({search:'@MEMBRE'})}))
 assert.equal(calls,1);assert.match(html,/DÉVELOPPEUR/);assert.doesNotMatch(html,/Ajouter en ami/)
})

test('les lectures publiques et le sitemap passent uniquement par la projection sans multiplier les requêtes',async()=>{
 const calls=[]
 const row={id:profile.id,username:'membre',avatar_url:null,bio:null,created_at:profile.created_at}
 const chain={select(fields){calls.push(['select',fields]);return this},order(){return this},range(){return this},eq(){return this},ilike(){return this},
  async maybeSingle(){return {data:row,error:null}},then(resolve,reject){return Promise.resolve({data:[row],count:1,error:null}).then(resolve,reject)}}
 globalThis.__reliability={db:{from(table){calls.push(['from',table]);return chain}}}
 for(const read of [getPublicProfiles,getPublicProfilesPage,getPublicProfileIds,()=>getPublicProfileById(profile.id),()=>getPublicProfileByUsername('membre')]){
  calls.length=0
  const result=await read()
  assert.ok(result)
  assert.deepEqual(calls.filter(([operation])=>operation==='from'),[['from','public_profiles']])
  assert.ok(calls.filter(([operation])=>operation==='select').every(([,fields])=>!fields.includes('*')&&!/display_name|xp_points|email/.test(fields)))
 }
})
