import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = join(root, 'tools/public-cli')
await mkdir(join(pkg, 'dist'), { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: { cli: 'tools/public-cli/cli.ts', child: 'services/build-validator/child.ts' },
  outdir: join(pkg, 'dist'), outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node24',
})
await copyFile(join(root, 'node_modules/@zip.js/zip.js/LICENSE'), join(pkg, 'THIRD-PARTY-NOTICES.txt'))
