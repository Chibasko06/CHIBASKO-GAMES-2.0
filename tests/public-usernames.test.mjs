import test,{beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {renderToStaticMarkup} from 'react-dom/server'
import {generatedUsername,isPublicUsername,normalizePublicUsername,publicProfilePath,publicProfileIdentifier,RESERVED_USERNAMES} from '../lib/publicUsername.ts'
import {resolvePublicProfile} from '../lib/queries/profiles.ts'
import {profileFields} from '../lib/server/profileRequest.ts'
import PublicPlayer,{generateMetadata} from '../app/players/[username]/page.tsx'

const id='fc000000-0000-4000-8000-000000000001'
const profile={id,username:'chibasko06',bio:null,avatar_url:null,created_at:'2026-10-28',roles:{admin:true,developer:true}}
let calls,result,error
beforeEach(()=>{
 calls=[];result=profile;error=null
 globalThis.__reliability={db:{async rpc(name,args){calls.push({name,args});return {data:result,error}}}}
})

test('les pseudos partagent une validation canonique, sans caractères ambigus ou dangereux',()=>{
 assert.equal(normalizePublicUsername(' Chibasko06 '),'chibasko06')
 for(const value of ['chibasko06','joueur-01','joueur_01','a'.repeat(32)])assert.equal(isPublicUsername(value),true)
 for(const value of [...RESERVED_USERNAMES,'Chibasko06','ab','joueur ami','éclair','@joueur','../joueur','joueur/ami','-joueur','joueur-','a'.repeat(33),'joueur\u200b'])assert.equal(isPublicUsername(value),false,value)
 assert.equal(publicProfilePath('Chibasko06'),'/players/@chibasko06')
 assert.equal(publicProfileIdentifier('%40Chibasko06'),'@Chibasko06')
 for(const value of ['%2540chibasko06','%40../admin','%40admin','%zz','%40joueur%2Fami'])assert.equal(publicProfileIdentifier(value),null)
 for(const value of ['A','Éclair','admin','Nom avec espace','a'.repeat(80)])assert.equal(isPublicUsername(generatedUsername(value)),true,value)
 assert.equal(profileFields({username:' CHIBASKO06 ',bio:null}).username,'chibasko06')
 for(const value of ['ab','admin','éclair','../../admin'])assert.throws(()=>profileFields({username:value}),/pseudo/)
})

test('la résolution ne transmet aucune propriété privée supplémentaire et refuse une panne comme une absence',async()=>{
 result={...profile,email:'private@example.test',user_metadata:{admin:true}}
 assert.deepEqual(await resolvePublicProfile('@CHIBASKO06'),profile)
 assert.deepEqual(calls,[{name:'public_profile_resolve',args:{p_identifier:'@CHIBASKO06'}}])
 calls=[];assert.equal(await resolvePublicProfile('@../admin'),null);assert.equal(calls.length,0)
 result=null;assert.equal(await resolvePublicProfile('@inexistant'),null)
 error={code:'08006',message:'private transport'}
 await assert.rejects(resolvePublicProfile('@inexistant'),/temporairement/)
})

for(const alias of [id,'chibasko06','@CHIBASKO06','@ancien-pseudo'])test('un ancien lien redirige directement vers le pseudo courant : '+alias,async()=>{
 await assert.rejects(PublicPlayer({params:Promise.resolve({username:alias})}),/REDIRECT \/players\/@chibasko06/)
 assert.equal(calls.length,1)
})

test('la route canonique conserve les badges et les métadonnées publiques',async()=>{
 const params=Promise.resolve({username:'@chibasko06'})
 const html=renderToStaticMarkup(await PublicPlayer({params}))
 assert.match(html,/@chibasko06/);assert.match(html,/ADMIN/);assert.match(html,/DÉVELOPPEUR/)
 assert.doesNotMatch(html,/private@example/)
 assert.equal(calls.length,1)
 const metadata=await generateMetadata({params})
 assert.equal(metadata.alternates.canonical,'https://chibaskogames.fr/players/@chibasko06')
 assert.equal(metadata.openGraph.url,metadata.alternates.canonical)
})

test('un compte absent reste une 404 et n’est pas présenté comme un profil vide',async()=>{
 result=null
 await assert.rejects(PublicPlayer({params:Promise.resolve({username:'@inexistant'})}),/NOT_FOUND/)
 const metadata=await generateMetadata({params:Promise.resolve({username:'@inexistant'})})
 assert.equal(metadata.robots.index,false)
})

test('un segment encodé par Next.js rend le même profil canonique sans redirection en boucle',async()=>{
 const params=Promise.resolve({username:'%40chibasko06'})
 assert.match(renderToStaticMarkup(await PublicPlayer({params})),/@chibasko06/)
 assert.equal((await generateMetadata({params})).alternates.canonical,'https://chibaskogames.fr/players/@chibasko06')
})
