import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import sharp from 'sharp'
import GameThumbnail from '../components/GameThumbnail.tsx'
import HomeHeroActions from '../components/HomeHeroActions.tsx'

test('responsive derivatives select WebP without preloading the oversized original',()=>{
 const html=renderToStaticMarkup(createElement(GameThumbnail,{src:'https://assets.example.test/original.png',image:{src:'/optimized-game-images/a-720.webp',srcSet:'/optimized-game-images/a-360.webp 360w, /optimized-game-images/a-720.webp 720w'},alt:'Chibasko Pong',width:304,height:160,sizes:'304px',priority:true}))
 assert.match(html,/<picture>/);assert.match(html,/type="image\/webp"/)
 assert.match(html,/360w/);assert.match(html,/sizes="304px"/)
 assert.doesNotMatch(html,/original\.png/);assert.match(html,/fetchPriority="high"/)
 assert.match(html,/alt="Chibasko Pong"/)
})
test('unprepared catalogue images retain their original source and accessible name',()=>{
 const html=renderToStaticMarkup(createElement(GameThumbnail,{src:'https://assets.example.test/new.jpg',alt:'Nouveau jeu',width:304,height:160}))
 assert.match(html,/new\.jpg/);assert.match(html,/alt="Nouveau jeu"/);assert.doesNotMatch(html,/<picture>/)
})
test('hero reserves a second action before authentication resolves',()=>{
 for(const auth of [{loading:true,user:null},{loading:false,user:null},{loading:false,user:{id:'fixture'}}]){
  globalThis.__productAuth=auth
  const html=renderToStaticMarkup(createElement(HomeHeroActions))
  assert.match(html,/min-h-\[48px\]/)
  if(auth.loading)assert.match(html,/aria-hidden="true"/)
  else assert.match(html,auth.user?/Mon compte/:/Creer un compte/)
 }
 delete globalThis.__productAuth
})
test('navigation logo is a real 96px asset suitable for a 48px high-density display',async()=>{
 const bytes=await readFile('public/chibaskogames-logo-small.webp'),meta=await sharp(bytes).metadata()
 assert.equal(meta.width,96);assert.equal(meta.height,96);assert.equal(meta.format,'webp');assert.ok(bytes.length<5000)
})
test('generated catalogue variants exist, preserve proportions and cap decoded width',async()=>{
 const manifest=JSON.parse(await readFile('.distribution/catalogue-images.json','utf8'))
 assert.ok(Object.keys(manifest).length>0)
 for(const image of Object.values(manifest)){
  let ratio
  for(const candidate of image.srcSet.split(', ')){
   const [src,width]=candidate.split(' ')
   assert.match(src,/^\/optimized-game-images\/[a-f0-9]{24}-\d+\.webp$/)
   const meta=await sharp('public'+src).metadata()
   assert.equal(meta.width,Number(width.slice(0,-1)));assert.ok(meta.width<=1080)
   const current=meta.width/meta.height
   if(ratio)assert.ok(Math.abs(current-ratio)<0.04)
   ratio=current
  }
 }
})
