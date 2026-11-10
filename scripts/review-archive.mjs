import {build} from 'esbuild'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {join,resolve} from 'node:path'
import {loadReviewEnvironment} from './review-environment.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
export async function runArchiveCommand(args){
 const mode=args[0],options={}
 if(!['check-config','download','inspect','validate'].includes(mode)||args.length%2!==1)throw Error('invalid_archive_command')
 const names={ 'check-config':[],download:['upload','expected-size','etag-file','output'],inspect:['archive','game','version','policy','report'],validate:['archive','game','version','report']}[mode]
 for(let i=1;i<args.length;i+=2){const name=args[i].slice(2);if(!args[i].startsWith('--')||!names.includes(name)||Object.hasOwn(options,name)||!args[i+1])throw Error('invalid_archive_command');options[name]=args[i+1]}
 const stop=new AbortController(),shutdown=()=>stop.abort()
 process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
 try{
 const out=join(root,'.distribution/archive-tools');await mkdir(out,{recursive:true})
 await build({entryPoints:[join(root,'services/build-validator/read-only-archive.ts'),join(root,'services/build-validator/child.ts')],bundle:true,platform:'node',format:'esm',target:'node24',outdir:out,outExtension:{'.js':'.mjs'},logLevel:'silent'})
 const tools=await import(pathToFileURL(join(out,'read-only-archive.mjs')).href)
 if(mode==='inspect'||mode==='validate'){
   if(!options.archive||!!options.game!==!!options.version||mode==='inspect'&&(!options.game||!options.policy||!options.report))throw Error('invalid_archive_command')
   const policy=mode==='inspect'?JSON.parse(await readFile(resolve(options.policy),'utf8')):tools.UPLOAD_POLICY
   // Les limites proviennent de l'upload, jamais d'un manifeste tiers.
   const result=await tools.inspectReviewArchive(options.archive,options.game?{gameId:options.game,version:options.version}:null,policy,AbortSignal.any([stop.signal,AbortSignal.timeout(3600_000)]))
   if(options.report)await writeFile(resolve(options.report),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600})
   return {event:'archive_inspected',status:result.status,sourceSha256:result.sourceSha256,...(result.diagnostic?{diagnostic:result.diagnostic}:{})}
 }
 await loadReviewEnvironment(root)
 if(mode==='check-config'){
   const report=tools.r2EnvironmentReport(process.env,'STAGING')
   return {event:'archive_read_configuration',...report,...(!report.invalid.includes('GAME_BUILDS_STAGING_BUCKET')?{bucket:process.env.GAME_BUILDS_STAGING_BUCKET}:{}),remoteAccess:false,methods:['HEAD','GET']}
 }
 const storage=tools.readOnlyArchiveStorage(process.env)
 if(!options.upload||!options.output||!options['expected-size']||!options['etag-file']||!/^\d+$/.test(options['expected-size']))throw Error('invalid_archive_command')
 const etag=(await readFile(resolve(options['etag-file']),'utf8')).replace(/^\uFEFF/,'').trim()
 const result=await tools.downloadReviewArchive(storage,options.upload,Number(options['expected-size']),etag,resolve(options.output),AbortSignal.any([stop.signal,AbortSignal.timeout(900_000)]))
 await writeFile(join(resolve(options.output),'receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600})
 return {event:'archive_copied',bytes:result.bytes,sha256:result.sha256}
 }finally{process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 runArchiveCommand(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{
  // Une exception réseau peut contenir une URL signée : ne jamais la journaliser.
  const known=['invalid_archive_command','invalid_archive_size','invalid_archive_etag','original_archive_not_found','original_archive_metadata_mismatch','original_archive_size_mismatch','invalid_local_archive','invalid_inspection_policy','inspection_disk_space_insufficient','local_archive_changed_during_inspection']
  console.error(JSON.stringify({event:'archive_operation_failed',code:known.includes(error?.message)?error.message:'archive_operation_failed'}))
  process.exitCode=1
 })
}
