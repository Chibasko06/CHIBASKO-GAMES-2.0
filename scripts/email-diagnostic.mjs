import {build} from 'esbuild'
import {createInterface} from 'node:readline/promises'
import {fileURLToPath} from 'node:url'
import {DiagnosticInputError,diagnosticOptions,runDiagnostic} from './email-diagnostic-core.mjs'

try {
  const options=diagnosticOptions(process.argv.slice(2))
  if(options.help){
    console.log('npm run diagnose:email -- --type admin --sender developers --to adresse')
    console.log('npm run diagnose:email -- --type submission --mode classic --to adresse')
    console.log('Modes de soumission : classic, sdk, external. Aperçu par défaut, --send demande une confirmation interactive.')
  }else{
    const bundle=await build({entryPoints:[fileURLToPath(new URL('../lib/emailMessages.ts',import.meta.url))],
      bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'})
    const builders=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
    const summary=await runDiagnostic(options,builders,{confirm:async prompt=>{
      if(!process.stdin.isTTY||!process.stdout.isTTY)throw new DiagnosticInputError('La confirmation exige un terminal interactif.')
      const terminal=createInterface({input:process.stdin,output:process.stdout})
      try{return await terminal.question(prompt)}finally{terminal.close()}
    }})
    if(['unconfirmed','provider_error'].includes(summary.outcome))process.exitCode=1
  }
}catch(error){
  console.error(error instanceof DiagnosticInputError?error.message:'Diagnostic interrompu. Vérifier la configuration locale et les droits du dossier de sortie. Aucun nouvel essai automatique.')
  process.exitCode=1
}
