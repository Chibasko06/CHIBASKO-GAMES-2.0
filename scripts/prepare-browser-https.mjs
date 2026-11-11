import {execFileSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {X509Certificate} from 'node:crypto'
import {fileURLToPath} from 'node:url'

export function prepareBrowserHTTPS(){
 const directory=resolve('.distribution/cookie-lab'),key=join(directory,'key.pem'),cert=join(directory,'cert.pem')
 try{if(existsSync(key)&&new Date(new X509Certificate(readFileSync(cert)).validTo).getTime()>Date.now()+3600000)return}catch{}
 const commands=[process.env.OPENSSL_BIN,'openssl'].filter(Boolean)
 if(process.platform==='win32'){
  try{const gitCore=execFileSync('git',['--exec-path'],{encoding:'utf8',windowsHide:true}).trim();commands.push(resolve(gitCore,'../../../usr/bin/openssl.exe'))}catch{}
 }
 const command=commands.find(candidate=>{try{execFileSync(candidate,['version'],{stdio:'pipe',windowsHide:true});return true}catch{return false}})
 if(!command)throw Error('OpenSSL est nécessaire aux tests HTTPS locaux. Définir OPENSSL_BIN puis relancer scripts/prepare-browser-https.mjs.')
 mkdirSync(directory,{recursive:true})
 execFileSync(command,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','2','-subj','/CN=Chibasko HTTPS fixture','-addext','subjectAltName=DNS:localhost,DNS:portal.test,DNS:game.test,DNS:one.play.test,DNS:portal.play.test,DNS:chibaskogames.fr,DNS:*.chibaskogames-play.fr'],{stdio:'pipe',windowsHide:true})
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{prepareBrowserHTTPS();console.log('Certificat HTTPS de test disponible dans le dossier local ignoré par Git.')}catch(error){console.error(error.message);process.exitCode=1}
}
