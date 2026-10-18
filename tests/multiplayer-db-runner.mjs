import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {multiplayerLobbyService} from '../lib/multiplayer-lobby/service.ts'
import {runLobbyBrowser} from './multiplayer-lobby.browser.mjs'

const q=value=>"'"+String(value).replaceAll("'","''")+"'"
export async function runMultiplayerTests(query) {
 const game='23232323-2323-4323-8323-232323232323'
 const actors=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd']
 // Each adapter uses a fresh PostgreSQL connection for every RPC; no shared service object.
 function instance(){return multiplayerLobbyService({async call(name,args){
  assert.match(name,/^distribution_multiplayer_[a-z_]+$/)
  const parameters=Object.entries(args).map(([key,value])=>key+' => '+(value===null?'null':typeof value==='boolean'?String(value):q(value))).join(',')
  try {const output=await query(`set role service_role;select public.${name}(${parameters})`);return output==='t'?true:output==='f'?false:JSON.parse(output)}
  catch(error){throw new Error(error.stderr?.match(/ERROR:\s+([^\r\n]+)/)?.[1]??'database_error')}
 }})}
 const A=instance(),B=instance(),[owner,second,third,fourth]=actors
 let lobby=await A.create(owner,game,'public',randomUUID())
 await B.mutate(second,lobby.id,'join')
 assert.equal((await A.list(owner,game)).items.find(row=>row.id===lobby.id).currentPlayers,2)
 const seats=await Promise.allSettled([third,fourth].map(actor=>B.mutate(actor,lobby.id,'join')))
 assert.equal(seats.filter(result=>result.status==='fulfilled').length,1)
 assert.match(seats.find(result=>result.status==='rejected').reason.message,/lobby_full/)
 const thirdActor=seats[0].status==='fulfilled'?third:fourth
 for(const actor of [owner,second,thirdActor])await A.mutate(actor,lobby.id,'ready',true)
 const starts=await Promise.all([A.mutate(owner,lobby.id,'start'),B.mutate(owner,lobby.id,'start')])
 assert.equal(starts[0].onlineSessionReference,starts[1].onlineSessionReference)
 assert.equal(await query(`select count(*) from public.multiplayer_lobby_rounds where lobby_id=${q(lobby.id)}`),'1')
 assert.equal(await query(`select count(*) from public.game_online_participants where session_id=${q(starts[0].onlineSessionReference)}`),'3')
 assert.equal((await B.get(second,lobby.id)).status,'starting')
 assert.ok(!JSON.stringify(starts).includes(owner))
 // Leave and START compete for the same lock. Either a frozen full roster with
 // revoked admission, or a smaller eligible roster, is a coherent outcome.
 let race=await A.create(owner,game,'public',randomUUID());await B.mutate(second,race.id,'join')
 await A.mutate(owner,race.id,'ready',true);await B.mutate(second,race.id,'ready',true)
 await Promise.allSettled([A.mutate(owner,race.id,'start'),B.mutate(second,race.id,'leave')])
 assert.equal(await query(`select count(*)<=1 from public.multiplayer_lobby_rounds where lobby_id=${q(race.id)}`),'t')
 assert.equal((await A.get(owner,race.id)).members.length,1)
 const privateLobby=await A.create(owner,game,'private',randomUUID())
 await assert.rejects(B.mutate(second,privateLobby.id,'join'),/lobby_not_found/)
 await assert.rejects(query(`insert into public.multiplayer_lobbies(game_id,version_id,access,code,min_players,max_players,start_policy) select game_id,version_id,access,code,min_players,max_players,start_policy from public.multiplayer_lobbies where id=${q(privateLobby.id)}`),/duplicate|unique/i)
 await B.joinCode(second,game,privateLobby.code.toLowerCase())
 assert.equal((await A.get(owner,privateLobby.id)).members.length,2)
 // A distinct version exercises large rosters without changing an immutable build.
 await query(`insert into public.game_versions(game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
 select game_id,'2.0.0',1,1,jsonb_set(jsonb_set(manifest,'{version}','"2.0.0"'),'{capabilities,online,players,max}','128'),repeat('b',64),100,2 from public.game_versions where id='24242424-2424-4424-8424-242424242424';
 update public.game_versions set status='in_review' where version='2.0.0' and game_id=${q(game)};
 update public.game_versions set status='approved' where version='2.0.0' and game_id=${q(game)};
 update public.game_versions set status='published' where version='2.0.0' and game_id=${q(game)};
 select public.set_active_game_version(${q(game)},(select id from public.game_versions where version='2.0.0' and game_id=${q(game)}));
 insert into public.game_server_deployment_versions select '25252525-2525-4525-8525-252525252525',game_id,id from public.game_versions where game_id=${q(game)} and version='2.0.0';`)
 assert.equal((await A.get(owner,lobby.id)).gameVersionId,'24242424-2424-4424-8424-242424242424')
 const large=await A.create(owner,game,'public',randomUUID())
 const extra=Array.from({length:127},()=>randomUUID())
 await query(`insert into auth.users(id) values ${extra.map(id=>'('+q(id)+')').join(',')};insert into public.profiles select id,'Fixture participant' from auth.users on conflict do nothing`)
 for(const actor of extra)await B.mutate(actor,large.id,'join')
 for(const actor of [owner,...extra])await B.mutate(actor,large.id,'ready',true)
 const full=await A.mutate(owner,large.id,'start')
 assert.equal(await query(`select count(*) from public.game_online_participants where session_id=${q(full.onlineSessionReference)}`),'128')
 // Persistent rate limits survive rejected code lookups and independent instances.
 for(let i=0;i<20;i++)await assert.rejects(B.joinCode(fourth,game,'F'.repeat(20)),/lobby_not_found/)
 await assert.rejects(A.joinCode(fourth,game,'F'.repeat(20)),/rate_limited/)
 console.log('Multiplayer DB: private RLS, pinned versions, codes, replay, leader transfer, expiry, join/start races, two service instances and 128 participants passed.')
 // Reset fixture quotas only; production quotas are never bypassed by the API.
 await query('truncate public.multiplayer_api_limits')
 await runLobbyBrowser({A,B,actors,game,query})
}
