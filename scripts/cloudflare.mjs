import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'

const command = process.argv[2]
if (!['build', 'preview', 'deploy'].includes(command)) throw new Error('Unknown Cloudflare command')
// Keep the normal Next.js commands and Vercel configuration untouched.
const cli = fileURLToPath(new URL('../node_modules/@opennextjs/cloudflare/dist/cli/index.js', import.meta.url))
const args = [cli, command, ...process.argv.slice(3)]
if (command === 'deploy') args.push('--keep-vars')
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env, CHIBASKO_CLOUDFLARE: '1' },
})
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', async code => {
  process.exitCode = code ?? 1
  if (code !== 0 || command !== 'build') return
  try {
    // OpenNext copies ALL .env values into this fallback module by default.
    // Private values must come from Worker bindings, never a local build fallback.
    const envFile = new URL('../.open-next/cloudflare/next-env.mjs', import.meta.url)
    const values = await import(envFile.href)
    const safe = ['production', 'development', 'test'].map(mode => {
      const publicValues = Object.fromEntries(Object.entries(values[mode]).filter(([name]) => name.startsWith('NEXT_PUBLIC_')))
      return `export const ${mode} = ${JSON.stringify(publicValues)};`
    }).join('\n')
    await writeFile(envFile, safe + '\n')
    console.log('Cloudflare bundle: private .env fallbacks removed; runtime secrets required.')
  } catch (error) {
    console.error('Could not remove private environment fallbacks:', error.message)
    process.exitCode = 1
  }
})
