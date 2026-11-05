import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
export async function gameCompatibilityIntegration(query){
 const admin=randomUUID(),actor=randomUUID(),category=randomUUID(),legacy=randomUUID()
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${admin}','${admin}@example.test','{"username":"compat-admin"}'),('${actor}','${actor}@example.test','{"username":"compat-player"}');insert into admin_users(user_id) values('${admin}');insert into categories(id,name,slug) values('${category}','Compatibility','compat-fixture');insert into games(id,title,slug,game_url,mobile_compatible,is_published) values('${legacy}','Legacy','compat-legacy','https://example.test','Oui',true)`)
 await query(`insert into developer_contacts(user_id,first_name,last_name,contact_email,public_name) values('${actor}','Fixture','Developer','${actor}@example.test','Studio')`)
 const kinds=['Oui','Non','platform:mobile','platform:desktop','platform:both','',null,'Oui (tactile)']
 const expected=['both','desktop','mobile','desktop','both','unknown','unknown','both']
 for(let i=0;i<kinds.length;i++)assert.equal(await query(`set role anon;select public.game_compatibility(${kinds[i]===null?'null':"'"+kinds[i]+"'"})`),expected[i])
 await query(`insert into games(title,slug,game_url,mobile_compatible,is_published) select 'compat-bulk-'||i,'compat-bulk-'||i,'https://example.test',case when i%3=0 then 'platform:mobile' when i%3=1 then 'platform:desktop' else 'platform:both' end,true from generate_series(1,1206) i`)
 for(const device of ['mobile','desktop']){
  const ids=[]
  for(let offset=0;offset<804;offset+=100){const page=JSON.parse(await query(`set role anon;select catalogue_page(p_search=>'compat-bulk-',p_device=>'${device}',p_offset=>${offset},p_limit=>100,p_sort=>'recent')`));assert.equal(page.total,804);ids.push(...page.items.map(game=>game.id));assert.ok(page.items.every(game=>['platform:both','platform:'+device].includes(game.mobile_compatible)))}
  assert.equal(new Set(ids).size,804);assert.equal(ids.length,804)
 }
 for(const declaration of ['desktop','mobile','both']){
  const game=await query(`set role service_role;select distribution_register_game('${actor}','${randomUUID()}','Jeu SDK ${declaration}')`),upload=randomUUID(),version=randomUUID()
  await query(`insert into game_build_uploads(id,game_id,created_by,request_id,version,version_id,status,expected_size,policy,expires_at) values('${upload}','${game}','${actor}','${randomUUID()}','1.0.0','${version}','queued',100,'{"revision":1}',now()+interval '1 hour')`)
  const metadata={title:'SDK '+declaration,studio:'Studio',releaseDate:'2026-11-05',description:'Description du jeu SDK',categories:[category],mobile:declaration,technology:'HTML5'}
  const sid=await query(`set role service_role;select distribution_submit_catalogue('${actor}','${upload}','new',${literal(metadata)},'https://assets.chibaskogames.fr/game-thumbnails/${game}.png')`)
  assert.equal(await query(`select mobile_compatibility from game_submissions where id='${sid}'`),'platform:'+declaration)
  const manifest={gameId:game,version:'1.0.0',schemaVersion:1,integrationVersion:1,capabilities:{local:{players:{min:1,max:1}}},client:{entrypoints:{local:'index.html'}}}
  await query(`insert into game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by) values('${version}','${game}','1.0.0',1,1,${literal(manifest)},repeat('a',64),100,2,'${actor}');update game_build_uploads set status='completed' where id='${upload}';set role service_role;select distribution_review_action('${admin}','${upload}','review','{"tested":true,"content":true,"metadata":true,"behavior":true}')`)
  if(declaration==='mobile'){
   await query(`set role service_role;select distribution_admin_compatibility('${admin}','${upload}','both','platform:mobile')`)
   assert.equal(await query(`select reviewed_at is null and checklist='{}'::jsonb from game_build_reviews where upload_id='${upload}'`),'t')
   await assert.rejects(query(`set role service_role;select distribution_review_action('${admin}','${upload}','publish')`),/invalid_state/)
   await query(`set role service_role;select distribution_admin_compatibility('${admin}','${upload}','mobile','platform:both');select distribution_review_action('${admin}','${upload}','review','{"tested":true,"content":true,"metadata":true,"behavior":true}')`)
  }
  await query(`set role service_role;select distribution_review_action('${admin}','${upload}','publish')`)
  assert.equal(await query(`select mobile_compatible from games where id='${game}'`),'platform:'+declaration)
  await assert.rejects(query(`set role authenticated;select distribution_admin_compatibility('${admin}','${upload}','both','platform:${declaration}')`))
  await assert.rejects(query(`set role service_role;select distribution_admin_compatibility('${actor}','${upload}','both','platform:${declaration}')`),/forbidden/)
  if(declaration==='desktop'){
   const change=value=>query(`set role service_role;select distribution_admin_compatibility('${admin}','${upload}','${value}','platform:desktop')`)
   const results=await Promise.allSettled([change('mobile'),change('both')]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
   const current=await query(`select mobile_compatible from games where id='${game}'`);assert.ok(['platform:mobile','platform:both'].includes(current))
   await change(current.slice(9))
   assert.equal(await query(`select count(*) from game_build_review_events where upload_id='${upload}' and action like 'compatibility:%'`),'1')
  }
 }
 await query(`set role service_role;select admin_save_game('${admin}',${literal({title:'Legacy',slug:'compat-legacy',game_type:'classic',game_url:'https://example.test',is_published:true,mobile_compatible:'platform:desktop'})},'{}','${legacy}',null)`)
 assert.equal(await query(`select mobile_compatible from games where id='${legacy}'`),'platform:desktop')
 for(const role of ['anon','authenticated'])assert.equal(await query(`select has_function_privilege('${role}','public.distribution_admin_compatibility(uuid,uuid,text,text)','execute')`),'f')
 console.log('Compatibilité SQL : legacy, 1 206 jeux, SDK, publication, correction administrative, concurrence et privilèges vérifiés.')
}
