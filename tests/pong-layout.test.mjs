// Optional isolated browser layout test: no running site, account or game server.
// PONG_LAYOUT_PLAYWRIGHT may point to an already installed Playwright module.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ts from 'typescript'
import { Navbar } from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import PongCanvas from '../games/chibasko-pong/client/PongCanvas.tsx'

let chromium
try { ({ chromium } = createRequire(import.meta.url)(process.env.PONG_LAYOUT_PLAYWRIGHT || 'playwright')) } catch {}
const view = { phase: 'COUNTDOWN', remainingMs: 3000, width: 1000, height: 600, paddleWidth: 16, paddleHeight: 100, inset: 30, radius: 10,
  leftPaddleY: 250, rightPaddleY: 250, ballX: 500, ballY: 300, leftScore: 0, rightScore: 0, leftName: 'Joueur 1', rightName: 'Joueur 2', selfSide: '' }
const sizes = [[1366, 768], [1440, 900], [390, 844], [768, 1024], [844, 390]]
test('Pong court preserves ratio and usable controls across desktop/tablet/mobile layouts', { skip: !chromium }, async () => {
  const globals = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  const css = (await postcss([tailwind()]).process(globals, { from: resolve('app/globals.css') })).css
    + '\n' + await readFile(new URL('../games/chibasko-pong/client/pong.module.css', import.meta.url), 'utf8')
  const script = (await Promise.all(['pongLayout.ts', 'pongRenderer.ts'].map(async file => ts.transpileModule(
    await readFile(new URL('../games/chibasko-pong/client/' + file, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '')))).join('\n')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PONG_LAYOUT_BROWSER || undefined })
  const output = resolve('.next/pong-polish-qa'); await mkdir(output, { recursive: true })
  try {
    for (const local of [true, false]) for (const [width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024, deviceScaleFactor: 1 })
      const page = await context.newPage()
      await page.route('**/*', route => route.abort()) // fixture never accesses the site, Auth, assets or network
      const props = { view: { ...view, selfSide: local ? '' : 'LEFT' }, onInput() {}, ...(local ? { onRightInput() {} } : {}) }
      const game = renderToStaticMarkup(createElement(PongCanvas, props))
      const navbar = renderToStaticMarkup(createElement(Navbar))
      const footer = renderToStaticMarkup(createElement(Footer))
      await page.setContent(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${navbar}<main class="mx-auto w-full max-w-[2200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10"><div class="mx-auto min-w-0 max-w-5xl space-y-5"><a class="inline-block text-sm">← Retour à la fiche de Chibasko Pong</a><p class="text-sm">Partie locale · Sur le même appareil · Sans compte</p><section ${local ? 'data-pong-local-session' : ''} class="localSession min-w-0 space-y-5">${game}<button class="min-h-12 px-5 py-3">Quitter</button></section></div></main>${footer}</body></html>`)
      await page.addScriptTag({ content: script + `\nwindow.stopFit = fitPongCourt(document.querySelector('.game')); drawPong(document.querySelector('canvas').getContext('2d'), {current:${JSON.stringify(view)},previous:null,goUntil:0,receivedAt:0},0,true);` })
      // An online stage can sit below lobby UI; scrolling may grow it, never crop it.
      if (height < 500) await page.locator('.game').evaluate(element => element.scrollIntoView({ block: 'start' }))
      await page.waitForFunction(() => !document.querySelector('[data-pong-court]').style.getPropertyValue('--pong-court-height').includes('NaN'))
      await page.evaluate(async () => { for (let frame = 0; frame < 12; frame++) await new Promise(resolve => requestAnimationFrame(resolve)) })
      const layout = await page.evaluate(() => {
        const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } }
        return { canvas: rect(document.querySelector('canvas')), hud: rect(document.querySelector('.hud')),
          controls: [...document.querySelectorAll('.controls button')].map(rect),
          overflow: document.documentElement.scrollWidth > innerWidth, zoom: devicePixelRatio, scroll: scrollY,
          dimensions: [document.querySelector('canvas').width, document.querySelector('canvas').height] }
      })
      assert.equal(layout.overflow, false, `${local}/${width} horizontal overflow`)
      if (height >= 500) assert.equal(layout.scroll, 0, 'No scrolling needed for the initial court')
      assert.deepEqual(layout.dimensions, [1000, 600]); assert.ok(Math.abs(layout.canvas.width / layout.canvas.height - 5 / 3) < 0.01)
      assert.ok(layout.canvas.top >= 0 && layout.canvas.bottom <= height + 1, `${local}/${width} court cropped: ${JSON.stringify(layout)}`)
      if (local || width >= 1024) assert.ok(layout.hud.top >= 0, `${local}/${width} names cropped`)
      assert.equal(layout.controls.length, local ? 4 : 2)
      for (const button of layout.controls) {
        assert.ok(button.width >= 44 && button.height >= 44)
        assert.ok(button.top >= layout.canvas.bottom || button.bottom <= layout.canvas.top || button.right <= layout.canvas.left || button.left >= layout.canvas.right, 'Controls overlap court')
        if (local) assert.ok(button.bottom <= height + 1, `${width} local controls need scrolling: ${JSON.stringify(layout)}`)
      }
      await page.screenshot({ path: resolve(output, `${local ? 'local' : 'online'}-${width}x${height}.png`) })
      console.log(JSON.stringify({ mode: local ? 'local' : 'online', viewport: `${width}x${height}`, ...layout }))
      await page.evaluate(() => window.stopFit()); await context.close()
    }
  } finally { await browser.close() }
})
