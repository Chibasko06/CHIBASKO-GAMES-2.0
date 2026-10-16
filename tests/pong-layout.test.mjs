// Optional real-browser integration: platform chrome + public package exports.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { Navbar } from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

let chromium
try { ({ chromium } = createRequire(import.meta.url)(process.env.PONG_LAYOUT_PLAYWRIGHT || 'playwright')) } catch {}
test('installed Pong keeps its court and controls visible with real platform chrome at desktop/tablet/mobile sizes', { skip: !chromium }, async () => {
  const globals = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  const css = (await postcss([tailwind()]).process(globals, { from: resolve('app/globals.css') })).css
  const bundle = await build({ entryPoints: ['tests/fixtures/pong-host/browser-entry.mjs'], bundle: true, write: false,
    outdir: '.next/pong-package-layout', format: 'iife', platform: 'browser', metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' } })
  assert.ok(Object.keys(bundle.metafile.inputs).some(path => path.includes('chibasko-pong')))
  assert.ok(!Object.keys(bundle.metafile.inputs).some(path => /@colyseus|supabase/.test(path)))
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text
  const gameCss = bundle.outputFiles.find(file => file.path.endsWith('.css')).text
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PONG_LAYOUT_BROWSER || undefined })
  const output = resolve('.next/pong-package-layout'); await mkdir(output, { recursive: true })
  try {
    for (const local of [true, false]) for (const [width, height] of [[1366,768], [1440,900], [390,844], [768,1024], [844,390]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024, deviceScaleFactor: 1 })
      const page = await context.newPage(); await page.route('**/*', route => route.abort())
      const navbar = renderToStaticMarkup(createElement(Navbar)), footer = renderToStaticMarkup(createElement(Footer))
      await page.setContent(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${gameCss}</style></head><body>${navbar}<main style="max-width:1024px;margin:auto"><div id="pong-fixture"></div></main>${footer}<script>window.__pongLocal=${local}</script></body></html>`)
      await page.addScriptTag({ content: js }); await page.waitForSelector('canvas')
      await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve)) })
      const layout = await page.evaluate(() => {
        const rect = element => { const r = element.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height } }
        return { canvas:rect(document.querySelector('canvas')), controls:[...document.querySelectorAll('section[aria-label="Chibasko Pong"] button[aria-label]')].map(rect),
          overflow:document.documentElement.scrollWidth > innerWidth, dimensions:[document.querySelector('canvas').width, document.querySelector('canvas').height] }
      })
      assert.equal(layout.overflow, false); assert.deepEqual(layout.dimensions, [1000,600])
      assert.ok(Math.abs(layout.canvas.width/layout.canvas.height - 5/3) < .01)
      assert.ok(layout.canvas.top >= 0 && layout.canvas.bottom <= height + 1)
      assert.equal(layout.controls.length, local ? 4 : 2)
      for (const control of layout.controls) {
        assert.ok(control.width >= 44 && control.height >= 44)
        assert.ok(control.top >= layout.canvas.bottom || control.bottom <= layout.canvas.top || control.right <= layout.canvas.left || control.left >= layout.canvas.right)
        if (local) assert.ok(control.bottom <= height + 1)
      }
      await page.screenshot({ path: resolve(output, `${local?'local':'online'}-${width}x${height}.png`) })
      await page.evaluate(() => window.__unmountPong()); await context.close()
    }
  } finally { await browser.close() }
})
