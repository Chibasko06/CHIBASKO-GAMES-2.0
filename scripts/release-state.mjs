import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {resolve,basename} from 'node:path'
const exec=promisify(execFile)
const reports=[]
for(const input of process.argv.slice(2)) {
 const cwd=resolve(input),git=async(...args)=>(await exec('git',['--no-optional-locks','-c','core.fsmonitor=false',...args],{cwd,windowsHide:true,maxBuffer:1024*1024})).stdout.trimEnd()
 try {
  let upstream=null,ahead=null,behind=null,unpublishedCommits=[]
  try {
   upstream=await git('rev-parse','--abbrev-ref','@{upstream}')
   ;[behind,ahead]=(await git('rev-list','--left-right','--count','@{upstream}...HEAD')).split(/\s+/).map(Number)
   unpublishedCommits=(await git('log','--format=%H','@{upstream}..HEAD')).split('\n').filter(Boolean)
  }catch{}
  reports.push({repository:basename(cwd),branch:await git('rev-parse','--abbrev-ref','HEAD'),head:await git('rev-parse','HEAD'),
   upstream,ahead,behind,unpublishedCommits,tags:(await git('for-each-ref','--format=%(refname:short) %(objectname) %(*objectname)','refs/tags')).split('\n').filter(Boolean),
   dirty:(await git('status','--porcelain=v1','--untracked-files=all')).split('\n').filter(Boolean),trackingFreshness:'local_refs_only_no_fetch'})
 }catch {reports.push({repository:basename(cwd),status:'unavailable'});process.exitCode=1}
}
console.log(JSON.stringify(reports,null,2))
