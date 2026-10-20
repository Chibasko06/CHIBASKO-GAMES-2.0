import {build} from 'esbuild'
await build({entryPoints:['services/build-validator/main.ts','services/build-validator/child.ts','services/build-validator/healthcheck.ts'],
  bundle:true,platform:'node',format:'esm',target:'node24',outdir:'.distribution/validator',outExtension:{'.js':'.mjs'},
  packages:'bundle',logLevel:'info'})
