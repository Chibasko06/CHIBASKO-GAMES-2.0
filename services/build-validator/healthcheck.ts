import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {scratchPath} from './scratch'
try {
  const health=JSON.parse(await readFile(join(scratchPath(process.env),'health.json'),'utf8'))
  if(health.stopping || !Number.isFinite(health.updatedAt) || Date.now()-health.updatedAt>90_000 || health.updatedAt>Date.now()+5000)process.exitCode=1
}catch{process.exitCode=1}
