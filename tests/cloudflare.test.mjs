import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateGameThumbnail } from '../lib/server/gameThumbnailValidation.ts'
import { passwordResetClientHash } from '../lib/server/passwordReset.ts'
import { previewHandler } from '../cloudflare/preview.mjs'

test('getUser header and explicit JWT agree inside workerd with the installed OpenNext runtime', async () => {
  const { build } = await import('esbuild')
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare')
  const { fileURLToPath } = await import('node:url')
  const root = fileURLToPath(new URL('../', import.meta.url))
  const built = await build({
    stdin: { resolveDir: root, sourcefile: 'auth-probe-worker.mjs', contents: `
      import { createClient } from '@supabase/supabase-js';
      import { runWithCloudflareRequestContext } from './node_modules/@opennextjs/cloudflare/dist/cli/templates/init.js';
      import { getCloudflareContext } from '@opennextjs/cloudflare';
      import { createSupabaseAuthProbe } from './lib/server/supabaseAuthProbe.ts';
      import { previewHandler } from './cloudflare/preview.mjs';
      export default previewHandler({fetch(request,env,ctx) {
        return runWithCloudflareRequestContext(request,env,ctx,async()=>{
          await Promise.resolve();
          const token='e30.eyJleHAiOjQxMDI0NDQ4MDB9.signature';
          const results=[];
          for(const status of [200,401]) {
            const requests=[];
            const probe=createSupabaseAuthProbe('https://project.supabase.co',async(url,options)=>{
              const headers=new Headers(options.headers);
              requests.push({endpoint:String(url)==='https://project.supabase.co/auth/v1/user',
                jwt:headers.get('authorization')==='Bearer '+token,
                key:headers.get('apikey')===env.TEST_KEY});
              return Response.json(status===200?{id:'test-user',aud:'authenticated'}:
                {code:'bad_jwt',msg:'synthetic failure'},
                {status,headers:{'X-Supabase-Api-Version':'2024-01-01'}});
            });
            const client=createClient('https://project.supabase.co',env.TEST_KEY,{
              auth:{autoRefreshToken:false,persistSession:false},
              global:{headers:{Authorization:'Bearer '+token},fetch:probe.fetch}
            });
            for(const variant of ['header','explicit']) {
              const result=variant==='header'?await client.auth.getUser():await client.auth.getUser(token);
              probe.logResult(result.error,Boolean(result.data.user));
              results.push({variant,status,user_present:!!result.data.user,
                error_status:result.error?.status??null,error_code:result.error?.code??null});
            }
            if(requests.length!==2||requests.some(r=>!r.endpoint||!r.jwt||!r.key)) throw Error('Transport assertion failed');
          }
          return Response.json({context_available:!!getCloudflareContext().env,results});
        });
      }});
    ` },
    bundle: true, write: false, format: 'esm', platform: 'neutral',
    mainFields: ['module', 'main'], external: ['node:*', 'cloudflare:*'],
    define: {
      __BUILD_TIMESTAMP_MS__: '0', __NEXT_BASE_PATH__: '""',
      __ASSETS_RUN_WORKER_FIRST__: 'false', __TRAILING_SLASH__: 'false', __DEPLOYMENT_ID__: '""',
    },
    plugins: [{ name: 'empty-build-env', setup(builder) {
      builder.onResolve({ filter: /next-env\.mjs$/ }, () => ({ path: 'empty-env', namespace: 'auth-test' }))
      builder.onLoad({ filter: /.*/, namespace: 'auth-test' }, () => ({ contents: 'export const production = {}' }))
    } }],
  })
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: built.outputFiles[0].text,
    compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'],
    bindings: { TEST_KEY: 'sb_publishable_test' },
  }))
  try {
    const response = await worker.dispatchFetch('https://local.invalid/auth-test')
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.context_available, true)
    assert.deepEqual(payload.results, [
      { variant: 'header', status: 200, user_present: true, error_status: null, error_code: null },
      { variant: 'explicit', status: 200, user_present: true, error_status: null, error_code: null },
      { variant: 'header', status: 401, user_present: false, error_status: 401, error_code: 'bad_jwt' },
      { variant: 'explicit', status: 401, user_present: false, error_status: 401, error_code: 'bad_jwt' },
    ])
  } finally { await worker.dispose() }
})

test('thumbnails retain original bytes and use detected MIME, not filename', async () => {
  const bytes = await readFile(new URL('../public/chibaskogames-logo.png', import.meta.url))
  const result = await validateGameThumbnail(new File([bytes], 'untrusted.svg', { type: 'image/png' }))
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.extension, 'png')
  assert.deepEqual(result.buffer, new Uint8Array(bytes))
  await assert.rejects(validateGameThumbnail(new File([bytes], 'x.png', { type: 'image/jpeg' })))
  await assert.rejects(validateGameThumbnail(new File(['not an image'], 'x.png', { type: 'image/png' })))
  await assert.rejects(validateGameThumbnail(new File([], 'x.png', { type: 'image/png' })))
  await assert.rejects(validateGameThumbnail(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })))
})

test('static SVG remains supported; active SVG and external resources are rejected', async () => {
  const svg = content => new File([
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${content}</svg>`,
  ], 'image.svg', { type: 'image/svg+xml' })
  assert.equal((await validateGameThumbnail(svg('<rect width="100" height="100" fill="red"/>'))).extension, 'svg')
  for (const unsafe of [
    '<script>alert(1)</script>', '<foreignObject/>', '<rect onload="alert(1)"/>',
    '<image href="https://example.com/image.png"/>', '<animate attributeName="href"/>',
    '<use href="&#106;avascript:alert(1)"/>', '<style>@import "https://example.com";</style>',
  ]) await assert.rejects(validateGameThumbnail(svg(unsafe)))
  await assert.rejects(validateGameThumbnail(new File([
    '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>',
  ], 'large.svg', { type: 'image/svg+xml' })))
})

test('Cloudflare ingress quotas use CF IP and ignore forged forwarded headers', () => {
  const previous = process.env.CHIBASKO_CLOUDFLARE
  process.env.PASSWORD_RESET_CODE_SECRET = 's'.repeat(32)
  process.env.CHIBASKO_CLOUDFLARE = '1'
  try {
    const request = (ip, forwarded) => new Request('https://example.com', {
      headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': forwarded },
    })
    assert.equal(passwordResetClientHash(request('1.2.3.4', '5.6.7.8')), passwordResetClientHash(request('1.2.3.4', '8.7.6.5')))
    assert.notEqual(passwordResetClientHash(request('1.2.3.4', '')), passwordResetClientHash(request('5.6.7.8', '')))
    assert.equal(passwordResetClientHash(request('invalid', '1.2.3.4')), passwordResetClientHash(request('invalid', '5.6.7.8')))
  } finally {
    if (previous === undefined) delete process.env.CHIBASKO_CLOUDFLARE
    else process.env.CHIBASKO_CLOUDFLARE = previous
  }
})

test('preview blocks robots and adds noindex on pages, assets, errors and redirects', async () => {
  let calls = 0
  const handler = previewHandler({ fetch: async request => {
    calls++
    return request.url.endsWith('/redirect')
      ? Response.redirect('https://example.com', 302)
      : new Response('original body', { status: request.url.endsWith('/missing') ? 404 : 200 })
  } })
  for (const path of ['/', '/asset.png', '/missing', '/redirect']) {
    const response = await handler.fetch(new Request(`https://preview.workers.dev${path}`), {}, {})
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
    if (path === '/redirect') assert.equal(response.headers.get('location'), 'https://example.com/')
    else assert.equal(await response.text(), 'original body')
  }
  const response = await handler.fetch(new Request('https://preview.workers.dev/robots.txt'), {}, {})
  assert.equal(await response.text(), 'User-agent: *\nDisallow: /\n')
  assert.equal(calls, 4)
})
