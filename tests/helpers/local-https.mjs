import {createServer as httpsServer} from 'node:https'
import {createServer as httpServer} from 'node:http'
import {connect} from 'node:net'
import {readFileSync} from 'node:fs'
import {prepareBrowserHTTPS} from '../../scripts/prepare-browser-https.mjs'

// Le proxy n'établit aucune connexion distante, même après une redirection.
// Le certificat auto-signé est une fixture ignorée par Git, jamais un certificat de production.
export async function localHTTPSFixture(allowedHost,handler){
 prepareBrowserHTTPS()
 const sockets=new Set(),errors=[]
 const server=httpsServer({key:readFileSync('.distribution/cookie-lab/key.pem'),cert:readFileSync('.distribution/cookie-lab/cert.pem')},async(req,res)=>{
  try{
   const url=new URL(req.url,'https://'+req.headers.host)
   if(url.port||!allowedHost(url.hostname)){res.writeHead(403);res.end();return}
   const chunks=[];let size=0
   for await(const chunk of req){size+=chunk.length;if(size>1048576){res.writeHead(413);res.end();return}chunks.push(chunk)}
   const response=await handler(new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}))
   res.writeHead(response.status,Object.fromEntries(response.headers))
   res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()))
  }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('fixture_failed')}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const proxy=httpServer((_req,res)=>{res.writeHead(403);res.end()})
 proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
 proxy.on('connect',(req,socket,head)=>{
  let target;try{target=new URL('https://'+req.url)}catch{socket.destroy();return}
  if(!allowedHost(target.hostname)||(target.port&&target.port!=='443')){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return}
  const upstream=connect(server.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)})
  socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy())
 })
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));let closed=false
 return {proxy:'http://127.0.0.1:'+proxy.address().port,errors,async close(){if(closed)return;closed=true;for(const socket of sockets)socket.destroy();server.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>proxy.close(resolve))])}}
}
