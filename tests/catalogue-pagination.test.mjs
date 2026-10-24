import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readAllRows,pageNumber} from '../lib/pagination.ts'
import {DataAccessError} from '../lib/dataAccess.ts'
import {getGamesCatalog,getCataloguePage,getGameBySlug,getFeaturedGames,getGamePublicStats} from '../lib/queries/games.ts'
import {getRecentPlayHistory} from '../lib/queries/history.ts'
import {readAuthUsers} from '../lib/server/adminRead.ts'
import {getPublicProfilesPage} from '../lib/queries/profiles.ts'
import {getFavoriteGamesPage} from '../lib/queries/favorites.ts'
import {GET as adminGames} from '../app/api/admin/games/route.ts'
import {GET as adminUsers} from '../app/api/admin/users/route.ts'

test('un catalogue de 1 205 jeux est parcouru sans omission ni dépassement des lots',async()=>{
 const rows=Array.from({length:1205},(_,i)=>({id:String(i),slug:'jeu-'+i,is_published:true})),calls=[]
 globalThis.__reliability={db:{async rpc(name,args){calls.push({name,args});const matched=args.p_slug?rows.filter(row=>row.slug===args.p_slug):rows;return {data:{items:matched.slice(args.p_offset,args.p_offset+args.p_limit),total:matched.length},error:null}}}}
 const all=await getGamesCatalog()
 assert.deepEqual(all.map(row=>row.id),rows.map(row=>row.id));assert.equal(calls.length,13)
 calls.length=0
 assert.equal((await getGameBySlug('jeu-1204')).id,'1204');assert.equal(calls.length,1);assert.equal(calls[0].args.p_limit,1)
 calls.length=0
 assert.equal((await getFeaturedGames(8)).length,8);assert.equal(calls[0].args.p_limit,8)
 const [left,right]=await Promise.all([getCataloguePage({offset:24}),getCataloguePage({offset:48})])
 assert.equal(new Set([...left.items,...right.items].map(row=>row.id)).size,48)
})

test('la pagination complète ne confond pas troncature, erreur et liste vide',async()=>{
 const rows=Array.from({length:1205},(_,i)=>({id:i})),ranges=[]
 const result=await readAllRows('test_pages',async(from,to)=>{ranges.push([from,to]);return {data:rows.slice(from,Math.min(to+1,from+37)),count:rows.length,error:null}})
 assert.deepEqual(result,rows);assert.equal(ranges[1][0],37)
 assert.deepEqual(await readAllRows('empty',async()=>({data:[],count:0,error:null})),[])
 await assert.rejects(readAllRows('cut',async()=>({data:[],count:1205,error:null})),DataAccessError)
 await assert.rejects(readAllRows('missing_count',async()=>({data:[],count:null,error:null})),DataAccessError)
 await assert.rejects(readAllRows('duplicate',async()=>({data:[{id:'same'}],count:2,error:null})),DataAccessError)
 await assert.rejects(readAllRows('changed',async(from)=>({data:rows.slice(from,from+100),count:from?1206:1205,error:null})),DataAccessError)
 await assert.rejects(readAllRows('network',async()=>{throw new TypeError('fixture')}),DataAccessError)
})

test('les statistiques de réaction ciblent uniquement le jeu affiché',async()=>{
 const calls=[];globalThis.__reliability={db:{async rpc(name,args){calls.push({name,args});return {data:[{game_id:'last',likes_count:7}],error:null}}}}
 assert.equal((await getGamePublicStats('last'))[0].likes_count,7)
 assert.deepEqual(calls,[{name:'catalogue_game_stats',args:{p_ids:['last']}}])
})

test('l’historique reçoit uniquement les derniers jeux distincts en une requête',async()=>{
 const rows=Array.from({length:5},(_,i)=>({historyId:String(i),played_at:String(1000-i),game:{id:i?'game-'+i:'same'}}));let calls=0
 globalThis.__reliability={db:{async rpc(name,args){calls++;assert.equal(name,'catalogue_recent_history');assert.deepEqual(args,{p_user:'user',p_limit:5});return {data:rows,error:null}}}}
 const result=await getRecentPlayHistory('user',5)
 assert.equal(result.length,5);assert.equal(calls,1);assert.equal(result[0].game.id,'same')
})

test('l’administration parcourt les pages Auth au lieu de limiter les e-mails à la première',async()=>{
 const rows=Array.from({length:1205},(_,id)=>({id:String(id)})),calls=[]
 const users=await readAuthUsers({auth:{admin:{async listUsers({page,perPage}){calls.push(page);return {data:{users:rows.slice((page-1)*perPage,page*perPage)},error:null}}}}})
 assert.deepEqual(users,rows);assert.equal(calls.length,13)
 assert.equal(pageNumber('2'),2);for(const value of ['-1','NaN','1e8',undefined])assert.equal(pageNumber(value),1)
})

test('profils et favoris appliquent leurs limites et conservent la date d’ajout du favori',async()=>{
 const calls=[];let rows=[]
 const chain={select(value,options){calls.push(['select',value,options]);return this},eq(key,value){calls.push(['eq',key,value]);return this},ilike(key,value){calls.push(['ilike',key,value]);return this},order(){return this},range(from,to){calls.push(['range',from,to]);return this},then(yes,no){return Promise.resolve({data:rows,count:1205,error:null}).then(yes,no)}}
 globalThis.__reliability={db:{from(){return chain}}}
 assert.equal((await getPublicProfilesPage('100%_',2)).total,1205)
 assert.ok(calls.some(call=>call[0]==='ilike'&&call[2]==='%100\\%\\_%'))
 assert.deepEqual(calls.at(-1),['range',24,47]);calls.length=0
 rows=[{id:'favorite',created_at:'2026-10-24',games:{id:'game',created_at:'2020-01-01'}}]
 const favorites=await getFavoriteGamesPage('owner',3)
 assert.equal(favorites.total,1205);assert.equal(favorites.entries[0].created_at,'2026-10-24');assert.equal(favorites.entries[0].favoriteId,'favorite')
 assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='user_id'&&call[2]==='owner'))
 assert.deepEqual(calls.at(-1),['range',48,71])
})

test('les pages admin sont bornées après autorisation sans requête Auth par profil',async()=>{
 let requested,reads=0
 const profiles=Array.from({length:50},(_,i)=>({id:String(i)}))
 const chain={select(){reads++;return this},order(){return this},range(from,to){requested=[from,to];return this},then(yes,no){return Promise.resolve({data:profiles,count:1205,error:null}).then(yes,no)}}
 const db={from(){return chain},async rpc(name,args){assert.equal(name,'catalogue_admin_users');assert.deepEqual(args,{p_actor:'admin',p_offset:50,p_limit:50});reads++;return {data:{users:profiles,total:1205},error:null}},auth:{admin:{getUserById(){assert.fail('Lecture Auth par profil')}}}}
 globalThis.__r2={adminCheck:async()=>({error:new Response(null,{status:403})})}
 assert.equal((await adminGames(new Request('https://example.test/api/admin/games?page=2'))).status,403);assert.equal(reads,0)
 assert.equal((await adminUsers(new Request('https://example.test/api/admin/users?page=2'))).status,403);assert.equal(reads,0)
 globalThis.__r2.adminCheck=async()=>({supabaseAdmin:db,user:{id:'admin'}})
 const response=await adminGames(new Request('https://example.test/api/admin/games?page=2'))
 assert.deepEqual(requested,[50,99]);assert.equal((await response.json()).total,1205)
 const users=await adminUsers(new Request('https://example.test/api/admin/users?page=2'));assert.equal((await users.json()).users.length,50);assert.equal(reads,2)
})
