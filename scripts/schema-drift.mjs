import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {migrations, baselineMigrations, sqlSha256} from './production-preflight.mjs'
import {readJson} from './read-json.mjs'

function canonical(value) {
  if(Array.isArray(value))return value.map(canonical)
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))
  return value
}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
export function compareSchema(snapshot,reference) {
  if(snapshot?.format!==1 || snapshot.readOnly!==true || !snapshot.objects || !snapshot.prerequisites || reference?.format!==1)throw Error('invalid_snapshot')
  const rows=[],add=(object,ok)=>rows.push({object,status:ok?'PASS':'BLOCKING_DRIFT'})
  const required={'auth.users.id':'uuid','auth.users.email':['text','varchar'],'auth.users.raw_user_meta_data':'jsonb','auth.users.created_at':'timestamptz',
    'public.games.id':'uuid','public.games.slug':'text','public.games.title':'text',
    'public.games.is_published':'bool','public.games.game_type':'text','public.games.multiplayer_game_id':'text',
    'public.profiles.id':'uuid','public.profiles.username':'text','public.admin_users.user_id':'uuid'}
  for(const [name,type] of Object.entries(required))add('prerequisite:'+name,[type].flat().includes(snapshot.prerequisites.columns?.[name]))
  const p=snapshot.prerequisites
  add('prerequisite:uuid_generator',p.uuidGenerator===true)
  for(const name of ['auth.users','games','profiles','admin_users'])add('primary_key:'+name,equal(p.primaryKeys?.[name],[name==='admin_users'?'user_id':'id']))
  for(const name of ['profiles','admin_users'])add('identity_foreign_key:'+name,p.identityForeignKeys?.[name]===true)
  add('prerequisite:unique_catalogue_slug',p.slugUnique===true)
  add('prerequisite:service_profile_read',p.serviceProfileRead===true)
  add('prerequisite:legacy_trigger_review',Array.isArray(p.legacyTriggers)&&p.legacyTriggers.length===0)
  add('prerequisite:catalogue_rls',p.gamesRls===true)
  add('prerequisite:admin_rls',p.adminRls===true)
  add('prerequisite:no_browser_catalogue_writes',p.browserCatalogueWrites===false)
  for(const role of ['anon','authenticated'])add('role:'+role,p.roles?.[role]?.superuser===false && p.roles?.[role]?.bypassRls===false)
  add('role:service_role',p.roles?.service_role?.superuser===false && p.roles?.service_role?.bypassRls===true)
  const allowedGameQual=new Set(['is_published','(is_published = true)'])
  const allowedAdminQual=new Set(['(auth.uid() = user_id)','(user_id = auth.uid())'])
  add('prerequisite:catalogue_admin_policies',Array.isArray(p.legacyPolicies) && p.legacyPolicies.every(policy=>
    policy.command==='SELECT' && policy.check===null && (policy.table==='games'?allowedGameQual.has(policy.using):allowedAdminQual.has(policy.using))))
  // Un préfixe cohérent indique une migration possible, pas un schéma prêt à servir.
  const stage=reference.stages.findIndex(candidate=>equal(candidate,snapshot.objects))
  add('migration_prefix_consistent',stage>=0)
  const final=reference.stages.at(-1),keys=new Set([...Object.keys(final),...Object.keys(snapshot.objects)])
  for(const object of [...keys].sort()) {
    const actual=snapshot.objects[object]
    if(actual===undefined)rows.push({object,status:stage>=0?'DIFFERENCE_EXPECTED':'BLOCKING_DRIFT'})
    else add(object,reference.stages.some(candidate=>Object.hasOwn(candidate,object) && equal(candidate[object],actual)))
  }
  const blocking=rows.filter(row=>row.status==='BLOCKING_DRIFT').length
  return {status:blocking?'BLOCKING_DRIFT':stage<migrations.length?'MIGRATIONS_REQUIRED':'PASS',matchedMigrationCount:stage<0?null:stage,
    pendingMigrations:stage<0?null:reference.migrations.slice(stage).map(item=>item.name),rows,
    schemaScope:'modeled_public_application_schema_and_legacy_storage_guards',supabaseManagedSchemas:'legacy_storage_write_guards_only',
    remoteAuthorization:'not_checked',dataIntegrity:'not_checked'}
}
export async function readReference() {
  const ref=JSON.parse(await readFile(new URL('../contracts/production-schema.v1.json',import.meta.url),'utf8'))
  if(ref.migrations.length!==migrations.length)throw Error('reference_outdated')
  for(const [names,entries] of [[migrations,ref.migrations],[baselineMigrations,ref.baselineMigrations]]) {
   if(!Array.isArray(entries)||entries.length!==names.length)throw Error('reference_outdated')
   for(const [index,name] of names.entries()) {
    const bytes=await readFile(new URL('../supabase/migrations/'+name,import.meta.url))
    if(entries[index].name!==name || entries[index].sha256!==sqlSha256(bytes))throw Error('reference_outdated')
   }
  }
  const snapshot=await readFile(new URL('../docs/sql/production-schema-snapshot.sql',import.meta.url))
  if(ref.snapshotSha256!==sqlSha256(snapshot))throw Error('reference_outdated')
  return ref
}
export async function main(args=process.argv.slice(2)) {
  if(args.length!==1)throw Error('snapshot_file_required')
  const result=compareSchema(await readJson(args[0]),await readReference())
  console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await main().catch(()=>{console.error(JSON.stringify({status:'BLOCKING_DRIFT',error:'schema_check_failed'}));process.exitCode=1})
}
