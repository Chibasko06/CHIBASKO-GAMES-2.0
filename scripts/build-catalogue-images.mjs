import nextEnv from '@next/env'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'

nextEnv.loadEnvConfig(process.cwd())
const directory=resolve('public/optimized-game-images'),cache=resolve('.distribution/catalogue-image-cache')
await Promise.all([mkdir(directory,{recursive:true}),mkdir(cache,{recursive:true})])
const manifestPath=resolve('.distribution/catalogue-images.json')
const configured=JSON.parse(await readFile('wrangler.jsonc','utf8')).vars??{}
const platform=process.env.NEXT_PUBLIC_SUPABASE_URL??configured.NEXT_PUBLIC_SUPABASE_URL
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??configured.NEXT_PUBLIC_SUPABASE_ANON_KEY
const offline=process.argv.includes('--offline')
let previous={}
try{previous=JSON.parse(await readFile(manifestPath,'utf8'))}catch{}
const manifest={}
for(const [url,image] of Object.entries(previous)){
 try{await readFile(resolve('public','.'+image.src));manifest[url]=image}catch{}
}
const trusted=new Set(['https://assets.chibaskogames.fr',new URL(platform).origin])
function allowed(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&trusted.has(url.origin)&&(url.origin==='https://assets.chibaskogames.fr'?url.pathname.startsWith('/game-thumbnails/'):url.pathname.startsWith('/storage/v1/object/public/'))}catch{return false}}
async function boundedBytes(response){
 const length=Number(response.headers.get('content-length')??0)
 if(length>8*1024**2)throw new Error('image_size_limit')
 const chunks=[];let total=0
 for await(const chunk of response.body){total+=chunk.length;if(total>8*1024**2)throw new Error('image_size_limit');chunks.push(chunk)}
 return Buffer.concat(chunks)
}
async function variants(url){
 if(!allowed(url))return
 const key=createHash('sha256').update(url).digest('hex')
 const path=resolve(cache,key+'.image')
 let bytes,etag
 try{bytes=await readFile(path);etag=await readFile(resolve(cache,key+'.etag'),'utf8')}catch{}
 if(!offline){
  const response=await fetch(url,{headers:etag?{'If-None-Match':etag}:{},redirect:'error',signal:AbortSignal.timeout(15000)})
  if(response.status!==304){
   if(!response.ok)throw new Error('image_fetch_failed')
   bytes=await boundedBytes(response);await writeFile(path,bytes)
   await writeFile(resolve(cache,key+'.etag'),response.headers.get('etag')??'')
  }
 }
 if(!bytes)return
 const metadata=await sharp(bytes,{limitInputPixels:16*1024**2}).metadata()
 if(!metadata.width||metadata.pages>1)return
 const hash=createHash('sha256').update(bytes).digest('hex').slice(0,24)
 const sizes=[...new Set([180,360,720,1080].map(width=>Math.min(width,metadata.width)))]
 const results=[]
 for(const width of sizes){
  const name=`${hash}-${width}.webp`
  await sharp(bytes,{limitInputPixels:16*1024**2}).rotate().resize({width,withoutEnlargement:true}).webp({quality:84,effort:5}).toFile(resolve(directory,name))
  const output=await sharp(resolve(directory,name)).metadata()
  results.push({src:'/optimized-game-images/'+name,width:output.width})
 }
 manifest[url]={src:results.find(image=>image.width>=720)?.src??results.at(-1).src,srcSet:results.map(image=>`${image.src} ${image.width}w`).join(', ')}
}
let sources=Object.keys(manifest)
if(!offline){
 try{
  const rows=[]
  for(let offset=0;offset<10000;offset+=1000){
   const url=new URL('/rest/v1/games',platform)
   url.search=new URLSearchParams({select:'thumbnail_url',is_published:'eq.true',order:'id.asc',limit:'1000',offset:String(offset)})
   const response=await fetch(url,{headers:{apikey:publicKey,Authorization:'Bearer '+publicKey},signal:AbortSignal.timeout(20000)})
   if(!response.ok)throw new Error('catalogue_unavailable')
   const page=await response.json();if(!Array.isArray(page))throw new Error('catalogue_invalid');rows.push(...page)
   if(page.length<1000)break
  }
  sources=[...new Set(rows.map(row=>row.thumbnail_url).filter(Boolean))]
 }catch{console.warn('Catalogue images: public catalogue unavailable; keeping cached derivatives.')}
}
let failed=0,index=0
await Promise.all(Array.from({length:4},async()=>{while(index<sources.length){const url=sources[index++];try{await variants(url)}catch{failed++}}}))
await sharp('public/chibaskogames-logo.png').resize(96,96).webp({quality:90,effort:5}).toFile('public/chibaskogames-logo-small.webp')
await writeFile(manifestPath,JSON.stringify(manifest)+'\n')
console.log(JSON.stringify({event:'catalogue_images_built',sources:sources.length,ready:Object.keys(manifest).length,failed,offline}))
