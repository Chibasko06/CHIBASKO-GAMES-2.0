import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
export async function googleProfileIntegration(query){
 await query("alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb")
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const add=async(metadata,provider='google')=>{const id=randomUUID();await query(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values('${id}','${id}@example.test',${literal(metadata)},${literal({provider})})`);return id}
 const read=async id=>JSON.parse(await query(`select row_to_json(p) from profiles p where id='${id}'`))
 const first=await add({full_name:'Google Fixture',avatar_url:'https://lh3.googleusercontent.com/a/fixture'}),row=await read(first)
 assert.equal(row.username,'google-fixture');assert.equal(row.avatar_url,'https://lh3.googleusercontent.com/a/fixture')
 const duplicate=await add({full_name:'Google Fixture',picture:'https://lh4.googleusercontent.com/a/second'})
 assert.notEqual((await read(duplicate)).username,row.username);assert.equal((await read(duplicate)).avatar_url,'https://lh4.googleusercontent.com/a/second')
 const absent=await add({name:'Sans Photo'});assert.equal((await read(absent)).avatar_url,null)
 const bad=await add({name:'Bad Photo',avatar_url:'https://lh3.googleusercontent.com.evil.test/a'});assert.equal((await read(bad)).avatar_url,null)
 const email=await add({username:'email-fixture',full_name:'Ignored Google Name',avatar_url:'https://lh3.googleusercontent.com/a/image'},'email');assert.equal((await read(email)).username,'email-fixture');assert.equal((await read(email)).avatar_url,null)
 await query(`update profiles set username='chosen-google-name',avatar_url='https://assets.chibaskogames.fr/avatars/custom.png',bio='Personal bio' where id='${first}';update auth.users set raw_user_meta_data=${literal({full_name:'Changed Name',avatar_url:'https://lh3.googleusercontent.com/a/changed'})} where id='${first}'`)
 const kept=await read(first);assert.equal(kept.username,'chosen-google-name');assert.equal(kept.bio,'Personal bio');assert.equal(kept.avatar_url,'https://assets.chibaskogames.fr/avatars/custom.png')
 for(const role of ['anon','authenticated']){
  assert.equal(await query(`select has_function_privilege('${role}','public.handle_new_user()','execute')`),'f')
  assert.equal(await query(`select has_function_privilege('${role}','public.google_profile_avatar(text)','execute')`),'f')
 }
 console.log('Profils Google : création, unicité, métadonnées, photo absente, conservation et permissions vérifiées sur PostgreSQL jetable.')
}
