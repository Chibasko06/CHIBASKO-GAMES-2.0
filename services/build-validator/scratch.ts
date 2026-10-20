import {mkdir,readdir,rm,lstat,writeFile,rename} from 'node:fs/promises'
import {join,resolve,parse,sep} from 'node:path'
import {tmpdir} from 'node:os'

export function scratchPath(env:Record<string,string|undefined>) {
  const root=resolve(env.GAME_BUILDS_SCRATCH_DIR ?? join(tmpdir(),'chibasko-validator'))
  if(root===parse(root).root)throw new Error('invalid_scratch_root')
  return root
}
/** This root is exclusively mounted by one service instance, never shared between replicas. */
export async function prepareScratch(root:string) {
  await mkdir(root,{recursive:true,mode:0o700})
  if((await lstat(root)).isSymbolicLink())throw new Error('invalid_scratch_root')
  for(const entry of await readdir(root,{withFileTypes:true})) {
    if(!entry.name.startsWith('chibasko-build-'))continue
    const target=resolve(root,entry.name)
    if(!target.startsWith(resolve(root)+sep) || entry.isSymbolicLink())throw new Error('invalid_scratch_entry')
    if(entry.isDirectory())await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100})
  }
}
export async function heartbeat(root:string,stopping=false) {
  const target=join(root,'health.json')
  await writeFile(target+'.tmp',JSON.stringify({updatedAt:Date.now(),stopping}),{mode:0o600})
  await rename(target+'.tmp',target)
}
