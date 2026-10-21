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
