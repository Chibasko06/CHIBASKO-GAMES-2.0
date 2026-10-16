import { registerHooks } from 'node:module'
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.module.css')) return { format:'module', shortCircuit:true, source:'export default new Proxy({}, {get:(_target,key)=>String(key)})' }
  return nextLoad(url, context)
} })
