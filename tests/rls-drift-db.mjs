import assert from 'node:assert/strict'
import {compareSchema} from '../scripts/schema-drift.mjs'

export async function rlsDriftIntegration(query,snapshot,reference){
 const one='fa990000-0000-4000-8000-000000000001',two='fa990000-0000-4000-8000-000000000002',game='fa990000-0000-4000-8000-000000000003'
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${one}','rls-one@example.test','{"username":"rls-one"}'),('${two}','rls-two@example.test','{"username":"rls-two"}');insert into public.games(id,title,slug,game_url) values('${game}','RLS local','rls-drift-local','https://example.test/game');insert into public.favorites(user_id,game_id) values('${two}','${game}')`)
 const read=async()=>query(`set role authenticated;set request.jwt.claim.sub='${one}';select count(*) from public.favorites where user_id='${two}'`)
 assert.equal(await read(),'0')
 const replace=mode=>query(`drop policy moderation_account_boundary on public.favorites;create policy moderation_account_boundary on public.favorites as ${mode} for all to authenticated using((select public.account_access())) with check((select public.account_access()))`)
 try{
  await replace('permissive')
  assert.equal(await read(),'1','La politique permissive reproduit une lecture croisee dans la base jetable')
  const actual=await snapshot(),policy=actual.objects['table:favorites'].policies.find(item=>item.name==='moderation_account_boundary')
  assert.equal(policy.permissive,'PERMISSIVE')
  const result=compareSchema(actual,reference)
  assert.equal(result.status,'BLOCKING_DRIFT')
  assert.ok(result.rows.some(row=>row.object==='table:favorites'&&row.status==='BLOCKING_DRIFT'))
 }finally{await replace('restrictive')}
 assert.equal(await read(),'0')
 assert.equal(compareSchema(await snapshot(),reference).status,'PASS','Les politiques publiques legitimes et la frontiere restauree restent valides')
 console.log('RLS : changement de mode detecte, lecture croisee reproduite puis bloquee, politiques publiques preservees sur PostgreSQL jetable.')
}
