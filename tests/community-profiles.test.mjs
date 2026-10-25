import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import RoleBadges from '../components/RoleBadges.tsx'
import {getCommunityProfilesPage} from '../lib/queries/profiles.ts'

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
