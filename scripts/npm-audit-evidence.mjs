import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {readJson} from './read-json.mjs'
try {
 if(process.argv.length!==3)throw Error()
 const report=await readJson(process.argv[2])
 if(report.auditReportVersion!==2 || !report.metadata?.vulnerabilities || !report.vulnerabilities)throw Error()
 const lock=await readFile(new URL('../package-lock.json',import.meta.url))
 console.log(JSON.stringify({format:1,scope:'production',lockfileSha256:createHash('sha256').update(lock).digest('hex'),
  counts:report.metadata.vulnerabilities,packages:Object.keys(report.vulnerabilities).sort()},null,2))
}catch{console.error(JSON.stringify({error:'invalid_audit_evidence'}));process.exitCode=1}
