import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {Miniflare, convertV4MiniflareOptions} from 'miniflare'

// Exerce la copie d'Undici utilisée par Miniflare, y compris son override de sécurité.
const {fetch, EventSource} = createRequire(import.meta.resolve('miniflare'))('undici')

async function withServer(handler, run) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('Undici conserve la vérification d’intégrité des réponses', async () => {
  const body = 'Chibasko Games — réponse locale'
  const integrity = 'sha256-' + createHash('sha256').update(body).digest('base64')
  await withServer((request, response) => response.end(body), async origin => {
    assert.equal(await (await fetch(origin, {integrity})).text(), body)
    await assert.rejects(fetch(origin, {integrity: 'sha256-' + Buffer.alloc(32).toString('base64')}))
  })
})

test('Undici reçoit les événements serveur et permet leur fermeture', {timeout: 15000}, async () => {
  await withServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'text/event-stream'})
    response.write('data: Chibasko Games\n\n')
  }, async origin => {
    const source = new EventSource(origin)
    try {
      const message = await new Promise((resolve, reject) => {
        source.onmessage = event => resolve(event.data)
        source.onerror = () => reject(new Error('Flux événementiel local indisponible'))
      })
      assert.equal(message, 'Chibasko Games')
    } finally {
      source.close()
    }
    assert.equal(source.readyState, EventSource.CLOSED)
  })
})

test('Miniflare exécute un Worker et conserve son fetch et ses en-têtes', {timeout: 30000}, async () => {
  await withServer((request, response) => {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end('Chibasko Games')
  }, async origin => {
    const worker = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-01',
      script: `export default {async fetch() {
        const upstream = await fetch(${JSON.stringify(origin)});
        return new Response(upstream.body, {headers: {'Content-Type': upstream.headers.get('Content-Type'), 'X-Content-Type-Options': 'nosniff'}});
      }}`,
    }))
    try {
      const response = await worker.dispatchFetch('http://localhost/')
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
      assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
      assert.equal(await response.text(), 'Chibasko Games')
    } finally {
      await worker.dispose()
    }
  })
})
