import assert from 'node:assert/strict'
export async function buildReviewWorkflowIntegration(query){
 const actor='faee0000-0000-4000-8000-000000000001',admin='faee0000-0000-4000-8000-000000000002',other='faee0000-0000-4000-8000-000000000003'
 const policy={revision:1,maxAttempts:3,maxArchiveBytes:524288000,maxTotalBytes:17179869184,maxFileBytes:4294967296,maxFiles:50000,maxManifestBytes:65536,maxCompressionRatio:200,maxPathDepth:32,partBytes:33554432,validationMs:900000,sessionSeconds:86400,signedUrlSeconds:900,jobSeconds:3600,maxActiveUploads:2,maxUploadsPerDay:20,maxApiPerMinute:120,redispatchSeconds:3600}
 const json=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb",read=async sql=>JSON.parse(await query(sql))
 await query(`insert into auth.users(id,email) values('${actor}','workflow-owner@example.test'),('${admin}','workflow-admin@example.test'),('${other}','workflow-other@example.test');insert into admin_users(user_id) values('${admin}')`)
 const game=await query(`select distribution_register_game('${actor}',gen_random_uuid(),'Workflow fixture')`)
 const create=async version=>read(`select to_jsonb(distribution_create_upload('${actor}','${game}','${version}',100,gen_random_uuid(),${json(policy)}))`)
 const u=await create('1.0.0'),id=u.id
 await query(`update game_build_uploads set status='queued',staging_etag='fixture' where id='${id}';insert into game_build_outbox(upload_id) values('${id}') on conflict do nothing`)
 const claimed=await read(`select to_jsonb(distribution_claim('${id}'))`),lease=claimed.lease_token
 const start=`select distribution_validation_start('${id}','${lease}')`
 await query(start);await query(start)
 assert.equal(await query(`select count(*) from game_build_review_events where upload_id='${id}' and action='validation_started:1'`),'1')
 const diagnostic={version:1,kind:'infrastructure',reason:'STORAGE_UNAVAILABLE',phase:'download'}
 const fail=`select distribution_validation_fail('${id}','${lease}','storage_error',false,'download',${json(diagnostic)})`
 await assert.rejects(query(`select distribution_validation_fail('${id}',gen_random_uuid(),'storage_error',false,'download',${json(diagnostic)})`),e=>/lease_lost/.test(e.stderr))
 await assert.rejects(query(`select distribution_validation_fail('${id}',null,'storage_error',false,'download',${json(diagnostic)})`),e=>/lease_lost/.test(e.stderr))
 await query(`create function public.workflow_test_failure() returns trigger language plpgsql as $$begin if new.upload_id='${id}' and new.action like 'validation_diagnostic:%' then raise exception 'fixture_journal_failure';end if;return new;end$$;create trigger workflow_test_failure before insert on game_build_review_events for each row execute function workflow_test_failure()`)
 await assert.rejects(query(fail),e=>/fixture_journal_failure/.test(e.stderr))
 assert.equal((await read(`select distribution_review_state('${id}')`)).status,'validating','Un journal indisponible ne laisse pas un échec sans diagnostic')
 await query('drop trigger workflow_test_failure on game_build_review_events;drop function workflow_test_failure()')
 await query(fail)
 const failed=await read(`select distribution_review_state('${id}')`)
 assert.equal(failed.diagnostic.reason,'STORAGE_UNAVAILABLE');assert.equal(failed.diagnostic.attempt,1)
 await assert.rejects(query(`select distribution_retry_validation('${other}','${id}',1)`),e=>/forbidden/.test(e.stderr))
 await assert.rejects(query(`select distribution_retry_validation('${admin}','${id}',2)`),e=>/invalid_state/.test(e.stderr))
 const retries=await Promise.all([1,2].map(()=>read(`select distribution_retry_validation('${admin}','${id}',1)`)))
 assert.ok(retries.every(row=>row.status==='queued'))
 assert.equal(await query(`select count(*) from game_build_review_events where upload_id='${id}' and action='validation_retry_requested:1'`),'1')
 const second=await read(`select to_jsonb(distribution_claim('${id}'))`)
 assert.equal(second.attempts,2)
 await query(`select distribution_validation_start('${id}','${second.lease_token}');select distribution_validation_fail('${id}','${second.lease_token}','validation_failed',false,'extract',${json({version:1,kind:'submission',reason:'FORBIDDEN_ARTIFACT_FILE',path:'_headers'})})`)
 await assert.rejects(query(`select distribution_retry_validation('${admin}','${id}',2)`),e=>/retry_not_allowed/.test(e.stderr))
 await assert.rejects(query(`select distribution_request_build_correction('${other}','${id}','Corriger le manifeste')`),e=>/forbidden/.test(e.stderr))
 await query(`select distribution_request_build_correction('${admin}','${id}','Corriger le manifeste');select distribution_request_build_correction('${admin}','${id}','Corriger le manifeste')`)
 assert.equal(await query(`select count(*) from game_build_review_events where upload_id='${id}' and action='correction_requested'`),'1')
 assert.equal(await query(`select decision from game_build_reviews where upload_id='${id}'`),'pending')
 await query(`update game_submission_drafts set upload_id='${id}',file_info='{"name":"old.zip"}',part_hashes='{"1":"old"}' where game_id='${game}'`)
 await assert.rejects(query(`select distribution_prepare_build_correction('${other}','${game}','${id}')`),e=>/forbidden/.test(e.stderr))
 await query(`select distribution_prepare_build_correction('${actor}','${game}','${id}');select distribution_prepare_build_correction('${actor}','${game}','${id}')`)
 const draft=await read(`select to_jsonb(d) from game_submission_drafts d where game_id='${game}'`)
 assert.equal(draft.upload_id,null);assert.equal(draft.file_info,null)
 assert.equal(await query(`select count(*) from game_build_uploads where id='${id}' and attempts=2 and status='failed'`),'1','L’original et ses tentatives sont conservés')
 const replacement=await create('1.0.0');assert.notEqual(replacement.id,id)
 await query(`update game_submission_drafts set upload_id='${replacement.id}' where game_id='${game}'`)
 await assert.rejects(query(`select distribution_prepare_build_correction('${actor}','${game}','${id}')`),e=>/draft_conflict/.test(e.stderr))
 await query(`update game_build_uploads set status='failed',error_code='storage_error',expires_at=now()-interval '1 second' where id='${replacement.id}'`)
 await assert.rejects(query(`select distribution_retry_validation('${admin}','${replacement.id}',0)`),e=>/upload_expired/.test(e.stderr))
 const successful=await create('2.0.0')
 await query(`update game_build_uploads set status='queued',staging_etag='fixture' where id='${successful.id}'`)
 const ready=await read(`select to_jsonb(distribution_claim('${successful.id}'))`)
 const checkpoint={manifest:{gameId:game,version:'2.0.0',schemaVersion:1,integrationVersion:1,capabilities:{local:{players:{min:1,max:1}}},client:{entrypoints:{local:'index.html'}}},fileCount:2,artifactSha256:'a'.repeat(64),artifactSize:100,archiveSha256:'b'.repeat(64),archiveSize:100}
 await query(`select distribution_checkpoint('${ready.id}','${ready.lease_token}',${json(checkpoint)});select distribution_validation_complete('${ready.id}','${ready.lease_token}')`)
 assert.equal((await read(`select distribution_review_state('${ready.id}')`)).status,'completed')
 const request='faee0000-0000-4000-8000-000000000004'
 await query(`select distribution_record_playtest('${admin}','${ready.id}','${request}','hello_timeout');select distribution_record_playtest('${admin}','${ready.id}','${request}','hello_timeout')`)
 assert.equal(await query(`select count(*) from game_build_review_events where upload_id='${ready.id}' and action like 'playtest_diagnostic:%'`),'1')
 await assert.rejects(query(`select distribution_record_playtest('${other}','${ready.id}','${request}','hello_timeout')`),e=>/forbidden/.test(e.stderr))
 await assert.rejects(query(`select distribution_record_playtest('${admin}','${ready.id}','${request}','raw private exception')`),e=>/invalid_request/.test(e.stderr))
 const signatures=['distribution_review_state(uuid)','distribution_validation_start(uuid,uuid)','distribution_validation_fail(uuid,uuid,text,boolean,text,jsonb)','distribution_validation_complete(uuid,uuid)','distribution_retry_validation(uuid,uuid,integer)','distribution_request_build_correction(uuid,uuid,text)','distribution_prepare_build_correction(uuid,uuid,uuid)','distribution_record_playtest(uuid,uuid,uuid,text)']
 for(const role of ['anon','authenticated'])for(const signature of signatures)assert.equal(await query(`select has_function_privilege('${role}','public.${signature}','execute')`),'f',role+':'+signature)
 for(const role of ['anon','authenticated'])await assert.rejects(query(`set role ${role};select * from game_build_review_events`))
 console.log('Build review workflow PASS: journal atomique, leases, reprise concurrente, correction sans rejet, historique et permissions.')
}
