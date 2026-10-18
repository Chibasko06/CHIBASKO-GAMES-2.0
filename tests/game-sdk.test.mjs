import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,realpath} from 'node:fs/promises'
import {resolve} from 'node:path'
import {INTEGRATION_VERSION,defineGame} from '@chibaskogames/sdk'
import {checkGameBoundaries,platformImportAllowed} from '../scripts/check-game-boundaries.mjs'
test('platform installs exact public SDK with no game package or local link',async()=>{
 const pkg=JSON.parse(await readFile('package.json')),lock=JSON.parse(await readFile('package-lock.json'))
 assert.equal(pkg.dependencies['@chibaskogames/sdk'],'0.3.0');assert.equal(lock.packages['node_modules/@chibaskogames/sdk'].version,'0.3.0')
 assert.equal(await realpath('node_modules/@chibaskogames/sdk'),resolve('node_modules/@chibaskogames/sdk'))
 assert.equal(INTEGRATION_VERSION,1);assert.equal(defineGame({id:'fixture-game',integrationVersion:1,capabilities:{local:{players:{min:1,max:1}}}}).integrationVersion,1)
})
test('boundaries reject any Chibasko Games gameplay package and unapproved runtime dependency',async()=>{
 for(const name of ['@chibaskogames/chibasko-pong/client','@chibaskogames/arbitrary-game','third-party-game','../../games/foo/engine','../game-server/room','<computed>'])assert.equal(platformImportAllowed(name),false,name)
 for(const name of ['@chibaskogames/sdk','@chibaskogames/sdk/client','@chibaskogames/sdk/server','react','@/lib/game-runtime/controller'])assert.equal(platformImportAllowed(name),true,name)
 await checkGameBoundaries()
})
