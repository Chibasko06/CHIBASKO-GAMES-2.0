import { build } from 'esbuild'
await build({entryPoints:['services/build-validator/main.ts','services/build-validator/child.ts'],
  bundle:true,platform:'node',format:'esm',target:'node24',outdir:'.distribution/validator',outExtension:{'.js':'.mjs'},
  packages:'bundle',logLevel:'info'})
await build({entryPoints:['cloudflare/build-dispatcher.ts'],bundle:true,platform:'browser',format:'esm',target:'es2022',
  outfile:'.distribution/dispatcher.mjs',logLevel:'info'})
await build({entryPoints:['cloudflare/artifact-gateway.ts'],bundle:true,platform:'browser',format:'esm',target:'es2022',
  outfile:'.distribution/artifact-gateway.mjs',logLevel:'info'})
await build({entryPoints:['cloudflare/session-maintenance.ts'],bundle:true,platform:'browser',format:'esm',target:'es2022',
  outfile:'.distribution/session-maintenance.mjs',logLevel:'info'})
