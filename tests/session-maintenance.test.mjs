import {test} from 'node:test'
import assert from 'node:assert/strict'
import worker,{maintainSessions} from '../cloudflare/session-maintenance.ts'
test('maintenance uses one fenced RPC and no public mutation endpoint',async()=>{
  let calls=0;const events=[]
  await maintainSessions({async call(name,args){assert.equal(name,'distribution_cleanup_sessions');assert.deepEqual(args,{});calls++;return true}},e=>events.push(e))
  assert.equal(calls,1);assert.equal(events[0].outcome,'completed')
  assert.equal(worker.fetch().status,404)
  await worker.scheduled(null,{GAME_SESSION_MAINTENANCE_ENABLED:'0'})
})
test('duplicate maintenance is harmless and failed RPCs never leak their content',async()=>{
  const events=[]
  await maintainSessions({async call(){return false}},e=>events.push(e))
  assert.equal(events[0].outcome,'already_running')
  await assert.rejects(maintainSessions({async call(){throw Error('fixture credential must never appear')}},e=>events.push(e)),/session_maintenance_failed/)
  assert.equal(events[1].outcome,'failed');assert.equal(JSON.stringify(events).includes('credential'),false)
})
