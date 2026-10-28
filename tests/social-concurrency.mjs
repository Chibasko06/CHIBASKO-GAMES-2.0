import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function socialConcurrency(query){
 const a='fe100000-0000-4000-8000-000000000001',b='fe100000-0000-4000-8000-000000000002',c='fe100000-0000-4000-8000-000000000003'
 await query(`insert into auth.users(id,email) values('${a}','race-alpha@example.test'),('${b}','race-beta@example.test'),('${c}','race-gamma@example.test')`)
 const as=async(actor,sql)=>{
  const result=await query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`)
  return JSON.parse(result.split(/\r?\n/).find(line=>line.startsWith('{')))
 }
 const change=(actor,action,target,relation=null,operation=randomUUID())=>as(actor,`select public.social_change('${action}','${target}','${operation}',${relation?"'"+relation+"'":'null'})`)
 const results=await Promise.all([change(a,'request',b),change(b,'request',a)])
 assert.deepEqual(results.map(r=>r.state).sort(),['incoming','outgoing'])
 assert.equal(await query(`select count(*) from public.social_relationships where user_low=least('${a}'::uuid,'${b}'::uuid) and user_high=greatest('${a}'::uuid,'${b}'::uuid)`),'1')
 const recipient=results[0].state==='incoming'?a:b,requester=recipient===a?b:a,id=results[0].relationId
 const race=await Promise.allSettled([change(recipient,'accept',requester,id),change(requester,'block',recipient)])
 assert.equal(race.filter(r=>r.status==='fulfilled').length>=1,true)
 assert.equal(await query(`select count(*) from public.social_relationships where user_low=least('${a}'::uuid,'${b}'::uuid) and user_high=greatest('${a}'::uuid,'${b}'::uuid)`),'0')
 assert.equal((await as(recipient,`select public.social_list('friends')`)).items.length,0)
 await change(recipient,'block',requester)
 const block=(await as(requester,`select public.social_list('blocked')`)).items[0]
 await change(requester,'unblock',recipient,block.id)
 await assert.rejects(change(requester,'request',recipient),e=>/social_unavailable/.test(e.stderr))
 const otherBlock=(await as(recipient,`select public.social_list('blocked')`)).items[0]
 await change(recipient,'unblock',requester,otherBlock.id)
 await change(requester,'block',recipient)
 await assert.rejects(change(requester,'unblock',recipient,block.id),e=>/social_conflict/.test(e.stderr))

 // Jeux de données créés uniquement dans le cluster local jetable.
 const targets=Array.from({length:61},(_,i)=>'fe200000-0000-4000-8000-'+String(i+1).padStart(12,'0'))
 await query(`insert into auth.users(id,email) values ${targets.map((id,i)=>"('"+id+"','social-volume-"+i+"@example.test')").join(',')}`)
 for(const target of targets.slice(0,41)){
  const pending=await change(target,'request',a)
  await change(a,'accept',target,pending.relationId)
 }
 const all=[];let cursor=null
 do{
  const page=await as(a,`select public.social_list('friends'${cursor?",'"+cursor.createdAt+"','"+cursor.id+"'":''})`)
  assert.ok(page.items.length<=20);all.push(...page.items.map(item=>item.profile.id));cursor=page.nextCursor
 }while(cursor)
 assert.equal(all.length,41);assert.equal(new Set(all).size,41)
 for(let i=0;i<30;i++)await change(c,'request',targets[i])
 await assert.rejects(change(c,'request',targets[30]),e=>/social_rate_limited/.test(e.stderr))
 await query(`update public.social_request_limits set day_at=now()-interval '1 day' where actor='${c}'`)
 for(const target of targets.slice(30,50))await change(c,'request',target)
 await assert.rejects(change(c,'request',targets[50]),e=>/social_rate_limited/.test(e.stderr))
 assert.equal((await as(c,`select public.social_list('friends')`)).items.length,0)

 const duplicate=randomUUID()
 const retries=await Promise.all([change(c,'block',targets[31],null,duplicate),change(c,'block',targets[31],null,duplicate)])
 assert.deepEqual(retries.map(r=>r.replayed).sort(),[false,true])
 await assert.rejects(change(c,'block',targets[32],null,duplicate),e=>/social_conflict/.test(e.stderr))
 await assert.rejects(query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${a}',true);select public.social_change('block','${targets[0]}','${randomUUID()}');select 1/0;commit;`))
 assert.equal(await query(`select count(*) from public.social_blocks where blocker='${a}' and blocked='${targets[0]}'`),'0')
 const deletionRace=await Promise.allSettled([change(c,'block',targets[32]),query(`select public.distribution_account_request('${c}','${c}')`)])
 assert.equal(deletionRace[1].status,'fulfilled')
 if(deletionRace[0].status==='rejected')assert.match(deletionRace[0].reason.stderr,/social_inactive/)
 const job=JSON.parse(deletionRace[1].value).id
 await assert.rejects(change(c,'block',targets[32]),e=>/social_inactive/.test(e.stderr))
 const lease=JSON.parse(await query(`select public.distribution_account_claim('${job}')`)).lease
 await query(`select public.distribution_account_prepare('${job}','${lease}')`)
 assert.equal(await query(`select count(*) from public.social_operations where actor='${c}' or target='${c}'`),'0')
 console.log('Social PostgreSQL : demandes opposées, blocages concurrents, idempotence, pagination, quotas et suppression validés.')
}
