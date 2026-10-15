import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'

// Node needs only this CSS Module stand-in. No Next, Auth or platform mocks.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^(next(?:\/|$)|@supabase\/|@\/)/.test(specifier)) throw new Error('Platform dependency in portable host: ' + specifier)
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.module.css')) {
      const names = [...readFileSync(new URL(url), 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1])
      return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(Object.fromEntries(names.map(name => [name, name]))) }
    }
    return nextLoad(url, context)
  },
})
