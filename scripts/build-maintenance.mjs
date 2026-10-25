import {build} from 'esbuild'

await build({entryPoints:['cloudflare/session-maintenance.ts'],bundle:true,platform:'browser',format:'esm',target:'es2022',
  outfile:'.distribution/session-maintenance.mjs',logLevel:'info'})
