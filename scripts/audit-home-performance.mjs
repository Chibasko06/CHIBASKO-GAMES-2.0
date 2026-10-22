import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'

const url=process.argv[2]??'https://chibaskogames.fr/'
const label=process.argv[3]??'baseline'
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid report label')
const directory=join('.distribution','home-performance')
await mkdir(directory,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:390,height:844}].filter(viewport=>!process.argv[4]||viewport.width===Number(process.argv[4]))){
  const context=await browser.newContext({viewport})
  const page=await context.newPage(),cdp=await context.newCDPSession(page),resources=new Map()
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true})
  cdp.on('Network.responseReceived',({requestId,type,response})=>{
   const parsed=new URL(response.url)
   resources.set(requestId,{url:parsed.origin+parsed.pathname,type,bytes:0,status:response.status})
  })
  cdp.on('Network.loadingFinished',({requestId,encodedDataLength})=>{const row=resources.get(requestId);if(row)row.bytes=encodedDataLength})
  await page.addInitScript(()=>{
   window.__homeShifts=[]
   window.__homeGeometry=[]
   let previous='',frames=0
   const sample=()=>{
    const main=document.querySelector('main'),header=document.querySelector('header')
    if(main){const signature=JSON.stringify([main.getBoundingClientRect().y,scrollY,document.body.style.cssText]);if(signature!==previous){previous=signature;window.__homeGeometry.push({time:performance.now(),signature,header:header?.getBoundingClientRect().toJSON(),headerHtml:header?.outerHTML,siblings:[...document.body.children].filter(node=>!['SCRIPT','LINK'].includes(node.tagName)).map(node=>node.outerHTML.slice(0,700))})}}
    if(frames++<600)requestAnimationFrame(sample)
   };requestAnimationFrame(sample)
   new PerformanceObserver(list=>{
    for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__homeShifts.push({value:entry.value,time:entry.startTime,sources:entry.sources?.map(source=>({element:source.node?.outerHTML?.slice(0,400),previous:source.previousRect.toJSON(),current:source.currentRect.toJSON()}))})
   }).observe({type:'layout-shift',buffered:true})
  })
  await page.goto(url,{waitUntil:'load',timeout:60000})
  await page.waitForTimeout(7000)
  const result=await page.evaluate(()=>({
   viewport:{width:innerWidth,height:innerHeight},shifts:window.__homeShifts,geometry:window.__homeGeometry,
   images:[...document.images].map(image=>({url:image.currentSrc.split('?')[0],natural:[image.naturalWidth,image.naturalHeight],display:[Math.round(image.getBoundingClientRect().width),Math.round(image.getBoundingClientRect().height)],loading:image.loading})),
   iframes:document.querySelectorAll('iframe').length,
   fonts:document.fonts.status,
  }))
  result.resources=[...resources.values()].sort((a,b)=>b.bytes-a.bytes)
  result.cls=result.shifts.reduce((sum,shift)=>sum+shift.value,0)
  await writeFile(join(directory,`${label}-${viewport.width}.json`),JSON.stringify(result,null,2)+'\n')
  await page.screenshot({path:join(directory,`${label}-${viewport.width}.png`)})
  console.log(JSON.stringify({label,width:viewport.width,cls:result.cls,shifts:result.shifts,largest:result.resources.slice(0,8)},null,2))
  await context.close()
 }
}finally{await browser.close()}
