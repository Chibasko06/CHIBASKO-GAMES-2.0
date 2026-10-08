import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { gameRegistry } from '../game-server/src/games/registry.ts'

export function generateManifest(registry = gameRegistry) {
  const manifest = {}
  for (const [id, game] of [...registry].sort(([a], [b]) => a.localeCompare(b))) {
    if (id !== game.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
      || !Number.isInteger(game.minPlayers) || !Number.isInteger(game.maxPlayers)
      || game.minPlayers < 1 || game.maxPlayers < game.minPlayers) throw new Error('Invalid game definition')
    manifest[id] = { minPlayers: game.minPlayers, maxPlayers: game.maxPlayers }
  }
  return JSON.stringify(manifest, null, 2) + '\n'
}
export async function checkManifest() {
  const actual = await readFile(new URL('../lib/multiplayer/gameManifest.generated.json', import.meta.url), 'utf8')
  assertManifestCurrent(actual)
}
export function assertManifestCurrent(actual) {
  if (actual !== generateManifest()) throw new Error('Game manifest is stale. Run npm run generate:game-manifest')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) await checkManifest()
  else {
    await mkdir(new URL('../lib/multiplayer/', import.meta.url), { recursive: true })
    await writeFile(new URL('../lib/multiplayer/gameManifest.generated.json', import.meta.url), generateManifest())
  }
}
