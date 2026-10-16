// Optional isolated browser layout test: no running site, account or game server.
// PONG_LAYOUT_PLAYWRIGHT may point to an already installed Playwright module.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import PongCanvas from '../dist/client/PongCanvas.js'

let chromium
try { ({ chromium } = createRequire(import.meta.url)(process.env.PONG_LAYOUT_PLAYWRIGHT || 'playwright')) } catch {}
const view = { phase: 'COUNTDOWN', remainingMs: 3000, width: 1000, height: 600, paddleWidth: 16, paddleHeight: 100, inset: 30, radius: 10,
  leftPaddleY: 250, rightPaddleY: 250, ballX: 500, ballY: 300, leftScore: 0, rightScore: 0, leftName: 'Joueur 1', rightName: 'Joueur 2', selfSide: '' }

test('portable Pong owns its readable surface, typography and responsive controls on a plain HTML host without Tailwind/preflight', { skip: !chromium }, async()=>{
  const css=await readFile(new URL('../client/pong.module.css',import.meta.url),'utf8')
  const script=(await Promise.all(['pongLayout.ts','pongRenderer.ts'].map(async file=>ts.transpileModule(
    await readFile(new URL('../client/'+file,import.meta.url),'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/export /g,'')))).join('\n')
  const browser=await chromium.launch({headless:true,executablePath:process.env.PONG_LAYOUT_BROWSER || undefined})
  try{
    for(const local of [true,false])for(const [width,height] of [[1366,768],[390,844],[844,390]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<1024})
      const page=await context.newPage();await page.route('**/*',route=>route.abort())
      const game=renderToStaticMarkup(createElement(PongCanvas,{view:{...view,selfSide:local?'':'LEFT'},onInput(){},...(local?{onRightInput(){}}:{})}))
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="max-width:1024px;margin:auto"><section ${local?'data-pong-local-session class="localSession"':''}>${game}${local?'<button class="exit">Quitter la partie locale</button>':''}</section></main></body></html>`)
      await page.addScriptTag({content:script+'\nfitPongCourt(document.querySelector(".game"));'})
      await page.evaluate(async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>requestAnimationFrame(resolve))})
      const layout=await page.evaluate(()=>{
        const canvas=document.querySelector('canvas').getBoundingClientRect(),game=getComputedStyle(document.querySelector('.game'))
        return {bottom:canvas.bottom,ratio:canvas.width/canvas.height,overflow:document.documentElement.scrollWidth>innerWidth,
          family:game.fontFamily,background:game.backgroundColor,controls:[...document.querySelectorAll('.controls button')].map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom}})}
      })
      assert.equal(layout.overflow,false);assert.ok(layout.bottom<=height+1);assert.ok(Math.abs(layout.ratio-5/3)<0.01)
      assert.match(layout.family,/Trebuchet MS/);assert.notEqual(layout.background,'rgba(0, 0, 0, 0)')
      assert.equal(layout.controls.length,local?4:2)
      for(const button of layout.controls){assert.ok(button.width>=44&&button.height>=44);assert.ok(button.bottom<=height+1)}
      await context.close()
    }
  }finally{await browser.close()}
})
