import assert from 'node:assert/strict'

export async function publicUsernamesConcurrency(query){
 const ids=['fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002']
 await query(`insert into auth.users(id,email) values('${ids[0]}','username-race-a@example.test'),('${ids[1]}','username-race-b@example.test')`)
 const results=await Promise.allSettled(ids.map(id=>query(`update public.profiles set username='identifiant-concurrent' where id='${id}' returning id`)))
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
 const denied=results.find(result=>result.status==='rejected')
 assert.match(denied.reason.stderr,/public_username_unavailable|duplicate key|dupliqu/i)
 const winner=results.find(result=>result.status==='fulfilled').value.trim()
 assert.ok(ids.includes(winner))
 await query(`update public.profiles set username='identifiant-renomme' where id='${winner}'`)
 const previous=JSON.parse(await query("select public.public_profile_resolve('@IDENTIFIANT-CONCURRENT')"))
 assert.equal(previous.id,winner);assert.equal(previous.username,'identifiant-renomme')
 const loser=ids.find(id=>id!==winner)
 await assert.rejects(query(`update public.profiles set username='identifiant-concurrent' where id='${loser}'`))
 await assert.rejects(query(`begin;update public.profiles set username='transaction-annulee' where id='${winner}';select 1/0;commit;`))
 await query(`update public.profiles set username='transaction-annulee' where id='${loser}'`)
}
