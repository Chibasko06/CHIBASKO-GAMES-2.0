import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {loadReviewEnvironment,configureReviewEnvironment,configurationFailure,ReviewConfigurationError} from './review-environment.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
const check=process.argv.length===3&&process.argv[2]==='--check-config'
async function main(){
 if(!check&&(process.argv.length!==3||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.argv[2]))){console.error('Usage: npm run review:game -- <upload-id> | --check-config');process.exitCode=1;return}
 if(process.versions.node.split('.')[0]!=='24')throw new ReviewConfigurationError('review_node_24_required')
 await loadReviewEnvironment(root)
 const report=configureReviewEnvironment()
 if(check){console.log(JSON.stringify({event:'review_configuration',...report,remoteAccess:false}));return}
 try{await build({entryPoints:[join(root,'services/build-validator/review.ts'),join(root,'services/build-validator/child.ts')],bundle:true,platform:'node',format:'esm',target:'node24',outdir:join(root,'.distribution/review'),outExtension:{'.js':'.mjs'},logLevel:'silent'})}catch{console.error('review_build_failed — compilation locale du validator impossible.');process.exitCode=1;return}
 const child=spawn(process.execPath,[join(root,'.distribution/review/review.mjs'),process.argv[2]],{cwd:root,stdio:'inherit',windowsHide:true})
 const stop=()=>child.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop)
 child.on('error',()=>{console.error('review_start_failed — lancement local du validator impossible.');process.exitCode=1})
 child.on('close',code=>{process.off('SIGINT',stop);process.off('SIGTERM',stop);process.exitCode=code??1})
}
main().catch(error=>{console.error(configurationFailure(error));process.exitCode=1})
