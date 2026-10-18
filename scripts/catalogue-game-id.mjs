import {readJson} from './read-json.mjs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function normalized(value) {
 if(Array.isArray(value))return value.map(normalized).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])]))
 return value
}
export function catalogueGameId(rows,slug,expectedCapabilities,expectedGameType='multiplayer_chibasko') {
 if(!['classic','multiplayer_chibasko'].includes(expectedGameType))throw Error('invalid_catalogue_type')
 if(!Array.isArray(rows) || rows.length!==1 || rows[0].slug!==slug)throw Error('catalogue_identity_ambiguous')
 const row=rows[0]
 if(!uuid.test(row.id) || row.id.startsWith('00000000-0000-') || row.gameType!==expectedGameType)throw Error('catalogue_identity_invalid')
 if(row.activeVersionId!==null) {
  if(!uuid.test(row.activeVersionId) || row.versionGameId!==row.id || row.versionStatus!=='published'
   || row.manifest?.gameId!==row.id || JSON.stringify(normalized(row.manifest.capabilities))!==JSON.stringify(normalized(expectedCapabilities)))throw Error('catalogue_capabilities_mismatch')
 }
 return {status:'PASS',gameId:row.id,slug,capabilitiesStatus:row.activeVersionId===null?'DIFFERENCE_EXPECTED':'PASS'}
}
export async function main(args=process.argv.slice(2)) {
 if(![3,4].includes(args.length) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args[1]))throw Error('invalid_arguments')
 const result=catalogueGameId(await readJson(args[0]),args[1],await readJson(args[2]),args[3])
 console.log(JSON.stringify(result,null,2))
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 await main().catch(()=>{console.error(JSON.stringify({status:'BLOCKING_DRIFT',error:'catalogue_identity_check_failed'}));process.exitCode=1})
}
