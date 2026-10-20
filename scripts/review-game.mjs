import {build} from 'esbuild'
import {spawn} from 'node:child_process'
if(process.argv.length!==3||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.argv[2])) {
  console.error('Usage: npm run review:game -- <upload-id>');process.exitCode=1
}else{
  await build({entryPoints:['services/build-validator/review.ts','services/build-validator/child.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outdir:'.distribution/review',outExtension:{'.js':'.mjs'},logLevel:'silent'})
  const child=spawn(process.execPath,['.distribution/review/review.mjs',process.argv[2]],{stdio:'inherit',windowsHide:true})
  const stop=()=>child.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop)
  child.on('error',()=>{console.error('review_start_failed');process.exitCode=1})
  child.on('close',code=>{process.off('SIGINT',stop);process.off('SIGTERM',stop);process.exitCode=code??1})
}
