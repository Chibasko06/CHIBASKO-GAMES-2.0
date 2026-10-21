import test from 'node:test'
import assert from 'node:assert/strict'
import {selectGameRecommendations} from '../lib/catalogueRecommendations.ts'
const cat=id=>({id,name:id,slug:id}),game=(id,categories=['primary'],is_published=true)=>({id,slug:id,title:id,thumbnail_url:null,categories:categories.map(cat),is_published})
const current=game('current',['primary','secondary'])
test('recommendations prioritize the primary category and then shared categories',()=>{
 const result=selectGameRecommendations(current,[game('secondary',['secondary']),game('other',['other']),game('primary')]);assert.deepEqual(result.map(game=>game.id),['primary','secondary'])
})
test('recommendations exclude self, unpublished games and duplicates',()=>{
 const result=selectGameRecommendations(current,[current,game('private',['primary'],false),game('one'),game('one')]);assert.deepEqual(result.map(game=>game.id),['one'])
})
test('recommendations are bounded to five public games',()=>assert.equal(selectGameRecommendations(current,Array.from({length:12},(_,i)=>game('game-'+i))).length,5))
test('missing categories use the public catalogue, while unrelated categories remain excluded',()=>{
 assert.deepEqual(selectGameRecommendations(game('current',[]),[game('one')]).map(game=>game.id),['one']);assert.deepEqual(selectGameRecommendations(current,[game('other',['other'])]),[])
})

test('category preview returns ten games in the existing popularity order',async()=>{
 const {getGamesByCategory}=await import('../lib/queries/games.ts')
 const category={id:'action',slug:'action',name:'Action',created_at:'2026-01-01T00:00:00Z'}
 globalThis.__productCategories=[category]
 globalThis.__productRows=Array.from({length:16},(_,i)=>({...game('fixture-'+i),is_published:true,views_count:16-i}))
 globalThis.__productCategoryLinks=globalThis.__productRows.map(row=>({game_id:row.id,categories:category}))
 try{const [section]=await getGamesByCategory(10);assert.equal(section.games.length,10);assert.deepEqual(section.games.map(game=>game.id),Array.from({length:10},(_,i)=>'fixture-'+i))}finally{globalThis.__productRows=[];globalThis.__productCategories=[];globalThis.__productCategoryLinks=[]}
})
