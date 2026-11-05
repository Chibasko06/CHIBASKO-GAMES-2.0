import test from 'node:test'
import assert from 'node:assert/strict'
import {gameCompatibility,supportsDevice,initialDevice} from '../lib/gameCompatibility.ts'
import {catalogueInput} from '../lib/server/submissionCatalogue.ts'
import {draftMetadata} from '../lib/server/developerDrafts.ts'
import {getCataloguePage,getFeaturedGames,getHomepageHighlights,getGamesByCategory,getGameRecommendations,getGameBySlug} from '../lib/queries/games.ts'
test('la déclaration commune conserve les décisions legacy sans certifier les valeurs inconnues',()=>{
 for(const value of ['Oui','true','mobile','Oui en mode tactile'])assert.equal(gameCompatibility(value),'both')
 for(const value of ['Non','PC uniquement','clavier obligatoire'])assert.equal(gameCompatibility(value),'desktop')
 for(const value of ['',null,'à tester'])assert.equal(gameCompatibility(value),'unknown')
 assert.equal(gameCompatibility('platform:mobile'),'mobile');assert.equal(gameCompatibility('platform:both'),'both')
 assert.equal(supportsDevice('Oui','desktop'),true);assert.equal(supportsDevice('Non','mobile'),false);assert.equal(supportsDevice(null,'mobile'),false)
})
test('téléphone, tablette, hybride, robot et contexte inconnu ont un repli explicite',()=>{
 assert.equal(initialDevice('iPhone',null,undefined),'mobile');assert.equal(initialDevice('Android Tablet',null,undefined),'mobile')
 assert.equal(initialDevice('Windows NT',null,undefined),'all');assert.equal(initialDevice('Googlebot Mobile','?1',undefined),'all')
 assert.equal(initialDevice('unknown',null,undefined),'all');assert.equal(initialDevice('iPad',null,'desktop'),'desktop')
})
test('les métadonnées SDK valident les trois déclarations et préservent les anciens booléens',()=>{
 const id='11111111-1111-4111-8111-111111111111',metadata={title:'Jeu',studio:'Studio',description:'Description',releaseDate:'2026-11-05',categories:[id],technology:'HTML5',mobile:null}
 for(const mobile of ['desktop','mobile','both',true,false]){const value={...metadata,mobile};assert.equal(catalogueInput({uploadId:id,kind:'new',metadata:value,ownership:true}).p_metadata.mobile,mobile);assert.equal(draftMetadata(value).mobile,mobile)}
 for(const mobile of ['unknown','yes',{},[]])assert.throws(()=>catalogueInput({uploadId:id,kind:'new',metadata:{...metadata,mobile},ownership:true}))
})
test('seul le catalogue choisi filtre ; les autres lectures et la fiche restent indépendantes',async()=>{
 const calls=[]
 globalThis.__reliability={db:{rpc:async(name,args)=>{calls.push({name,args});return {data:name==='catalogue_home'?[]:{items:[],total:0},error:null}}}}
 await getCataloguePage({device:'mobile',search:'jeu',category:'action',offset:24})
 await getFeaturedGames(8);await getHomepageHighlights();await getGamesByCategory(10)
 await getGameRecommendations({categories:[{slug:'action'}]})
 assert.equal(calls[0].args.p_device,'mobile')
 for(const call of calls.slice(1))assert.ok(call.args.p_device===undefined||call.args.p_device==='all')
 assert.equal(calls[0].args.p_offset,24);assert.equal(calls[0].args.p_search,'jeu');assert.equal(calls[0].args.p_category,'action')
 assert.equal(calls.find(call=>call.name==='catalogue_home').args.p_limit,10)
 calls.length=0;assert.equal(await getGameBySlug('jeu'),null);assert.equal(calls[0].args.p_device,'all')
})
