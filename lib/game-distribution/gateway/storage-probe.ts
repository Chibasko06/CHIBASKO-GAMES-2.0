import {GatewayError,type GatewayConfiguration} from './contracts'
import {publicCookieHeader,publicCookieValue} from './public-origin'
import {sha256} from '../build'

export function storageProbeHost(base:string){return 'diagnostics.'+base}

// Cet hôte ne dessert aucun fichier de jeu et ne réserve aucune session SQL.
export async function storageProbeResponse(request:Request,config:GatewayConfiguration){
 const url=new URL(request.url),headers=new Headers({'Cache-Control':'private, no-store','Content-Type':'text/html; charset=utf-8','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Origin-Agent-Cluster':'?1'})
 if(url.search)throw new GatewayError('invalid_request',400)
 if(url.pathname==='/check'){
  if(request.method!=='POST'||request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new GatewayError('forbidden',403)
  const reader=request.body?.getReader();if(!reader)throw new GatewayError('invalid_request',400)
  const chunks:Uint8Array[]=[];let size=0
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>256){await reader.cancel();throw new GatewayError('invalid_request',400)}chunks.push(part.value)}}finally{reader.releaseLock()}
  let body:{hash?:unknown;phase?:unknown};try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}body=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes))}catch{throw new GatewayError('invalid_request',400)}
  if(!body||typeof body!=='object'||Object.keys(body).length!==2||typeof body.hash!=='string'||!/^[a-f0-9]{64}$/.test(body.hash)||typeof body.phase!=='string'||!['write','read'].includes(body.phase))throw new GatewayError('invalid_request',400)
  let cookie:string|null=null;try{cookie=publicCookieValue(request)}catch{}
  const sent=Boolean(cookie&&await sha256(new TextEncoder().encode(cookie))===body.hash)
  if(body.phase==='read')headers.set('Set-Cookie',publicCookieHeader('0'.repeat(64),0))
  headers.set('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'")
  headers.set('Content-Type','application/json')
  return Response.json({cookie:sent},{headers})
 }
 if(url.pathname!=='/'||request.method!=='GET')throw new GatewayError('artifact_not_found',404)
 const cookie=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),hash=await sha256(new TextEncoder().encode(cookie)),nonce=crypto.randomUUID().replaceAll('-','')
 let previousHash='';try{const previous=publicCookieValue(request);if(previous)previousHash=await sha256(new TextEncoder().encode(previous))}catch{}
 const script=`addEventListener('load',async()=>{
 const p=new URLSearchParams(location.hash.slice(1)),target=p.get('parent'),nonce=p.get('nonce'),phase=p.get('phase');
 if(!${JSON.stringify(config.portalOrigins)}.includes(target)||parent===window||!nonce||!/^[a-f0-9-]{36}$/.test(nonce)||!['write','read'].includes(phase))return;
 history.replaceState(null,'',location.pathname);
 const key='chibasko-storage-probe';let local=false;
 try{if(phase==='write'){localStorage.setItem(key,nonce);local=localStorage.getItem(key)===nonce}else{local=localStorage.getItem(key)===nonce;localStorage.removeItem(key)}}catch{}
 const indexed=new Promise(resolve=>{
  let db,done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);db?.close();if(phase==='read')try{indexedDB.deleteDatabase(key)}catch{}resolve(value)},timer=setTimeout(()=>finish(false),3000);
  try{const open=indexedDB.open(key,1);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('probe'))open.result.createObjectStore('probe')};open.onerror=open.onblocked=()=>finish(false);open.onsuccess=()=>{if(done){open.result.close();return}db=open.result;try{const tx=db.transaction('probe',phase==='write'?'readwrite':'readonly'),store=tx.objectStore('probe');let valid=phase==='write';const operation=phase==='write'?store.put(nonce,'nonce'):store.get('nonce');operation.onsuccess=()=>{if(phase==='read')valid=operation.result===nonce};tx.oncomplete=()=>finish(valid);tx.onerror=tx.onabort=()=>finish(false)}catch{finish(false)}}}catch{finish(false)}
 });
 let sent=false;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
 try{const r=await fetch('/check',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:${JSON.stringify(hash)},phase}),signal:abort.signal,redirect:'error'});if(r.ok)sent=(await r.json()).cookie===true}catch{}finally{clearTimeout(timer)}
 const result={cookie:sent,retained:phase==='write'||${JSON.stringify(previousHash)}===p.get('previousHash'),local,indexed:await indexed};
 parent.postMessage({channel:'chibasko.storage-check',nonce,phase,hash:${JSON.stringify(hash)},result},target);
});`
 headers.set('Set-Cookie',publicCookieHeader(cookie))
 headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${config.portalOrigins.join(' ')}; sandbox allow-scripts allow-same-origin allow-pointer-lock; base-uri 'none'; object-src 'none'; form-action 'none'`)
 return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Diagnostic Chibasko Games</title><p>Vérification du stockage du navigateur…</p><script nonce="${nonce}">${script}</script></html>`,{headers})
}
