import { extractCommand } from './extract'
// No env, network, database or storage capability is passed to the parser process.
extractCommand(process.argv[2]).catch(()=>{process.exitCode=2})
