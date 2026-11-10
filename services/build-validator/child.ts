import { extractCommand } from './extract'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {extractionDiagnostic} from './extraction-diagnostics'
// No env, network, database or storage capability is passed to the parser process.
extractCommand(process.argv[2]).catch(async error=>{
  await writeFile(join(process.argv[2],'failure.json'),JSON.stringify(extractionDiagnostic(error)),{flag:'wx',mode:0o600}).catch(()=>{})
  process.exitCode=2
})
