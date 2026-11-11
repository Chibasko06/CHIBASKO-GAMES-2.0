/** Indices textuels uniquement : aucune détection négative ne prouve l'absence du SDK. */
export function integrationScanner(){
 let bytes=0,signals=false,complete=true
 return {
  file(path:string){let tail='',size=0;const text=/\.(html|js|mjs)$/i.test(path)
   return (chunk:Uint8Array)=>{
    if(!text)return
    const available=Math.max(0,Math.min(1024**2-size,8*1024**2-bytes,chunk.length))
    if(available<chunk.length)complete=false
    if(!available)return
    const value=tail+new TextDecoder().decode(chunk.subarray(0,available))
    if(/@chibaskogames\/sdk|connectPlatform|ChibaskoGames|chibasko\.game/.test(value))signals=true
    tail=value.slice(-80);size+=available;bytes+=available
   }
  },
  result(){return {signals,complete,bytes}}
 }
}
