import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolve,dirname,join} from 'node:path'
import {existsSync,readdirSync,readFileSync} from 'node:fs'
import ts from 'typescript'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

const category={id:'11111111-1111-4111-8111-111111111111',name:'Action',slug:'action',created_at:'2026-01-01T00:00:00Z'}
const game={id:'22222222-2222-4222-8222-222222222222',title:'Stickman Fights',slug:'stickman-fights',
 game_url:'https://legacy.example.test/index.html',thumbnail_url:null,description:'Un jeu de combat navigateur.',
 developer_name:'Studio de test',release_date_text:null,mobile_compatible:'oui',technology:'HTML5',provider_name:null,
 source_page_url:null,views_count:1,play_count:0,is_published:true,created_at:category.created_at,
 game_type:'classic',multiplayer_game_id:null,is_beta:false,active_version_id:null,catalogue_source:'legacy',
 categories:[category],favorites_count:0,ratings_count:0,average_rating:0,comments_count:0,likes_count:0,dislikes_count:0}
const profile={id:'33333333-3333-4333-8333-333333333333',username:'joueur-actuel',avatar_url:null,bio:'Profil public de test.',created_at:category.created_at,roles:{admin:true,developer:true}}

test('le Worker OpenNext démarre et rend les pages dynamiques sans accès distant',{timeout:60000},async()=>{
 const bundle=resolve(process.env.CLOUDFLARE_RUNTIME_BUNDLE??'.distribution/runtime-smoke/worker.js')
 assert.ok(existsSync(bundle),'Construire le Worker et son bundle Wrangler avant ce test.')
 let reads=0,profileReads=0
 const profileIdentifiers=[]
 const worker=new Miniflare(convertV4MiniflareOptions({
  modules:[{type:'ESModule',path:bundle},...readdirSync(dirname(bundle)).filter(name=>name.endsWith('.wasm'))
   .map(name=>({type:'CompiledWasm',path:join(dirname(bundle),name)}))],
  compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],
  bindings:{NEXT_PUBLIC_SUPABASE_URL:'https://supabase.example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public-key',
   NEXT_PUBLIC_SITE_URL:'https://chibaskogames.fr',CHIBASKO_CLOUDFLARE:'1',CONTACT_FORM_ENABLED:'0',
   GAME_ACCOUNT_DELETIONS_ENABLED:'0',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'0'},
  serviceBindings:{ASSETS:()=>new Response(null,{status:404})},
  // Les lectures publiques sont simulées ; aucun service réel n’est appelé.
  outboundService:async request=>{
   const path=new URL(request.url).pathname
   if(path==='/rest/v1/categories'&&request.method==='GET'){
    reads++;return Response.json([category],{headers:{'Content-Range':'0-0/1'}})
   }
   if(request.method==='POST'&&path==='/rest/v1/rpc/catalogue_page'){
    reads++;const input=await request.json()
    const items=input.p_slug&&input.p_slug!==game.slug?[]:[game]
    return Response.json({items,total:items.length})
   }
   if(request.method==='POST'&&path==='/rest/v1/rpc/catalogue_home'){
    reads++;return Response.json([{category,games:[game]}])
   }
   if(request.method==='POST'&&path==='/rest/v1/rpc/public_profile_resolve'){
    profileReads++;const {p_identifier}=await request.json()
    profileIdentifiers.push(p_identifier)
    const blocked=request.headers.get('authorization')?.slice(7)===blockedToken
    return Response.json(!blocked&&[profile.id,'@joueur-actuel','@ancien-pseudo','@JOUEUR-ACTUEL'].includes(p_identifier)?profile:null)
   }
   throw Error('Requête non autorisée dans la fixture du Worker.')
  },
 }))
 const tokenPayload={sub:'44444444-4444-4444-8444-444444444444',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'}
 const blockedToken=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')+'.fixture'
 const session={access_token:blockedToken,refresh_token:'fixture-refresh',expires_at:tokenPayload.exp,expires_in:3600,token_type:'bearer',user:{id:tokenPayload.sub,aud:'authenticated'}}
 const publicConfiguration=ts.parseConfigFileTextToJson('wrangler.jsonc',readFileSync('wrangler.jsonc','utf8')).config
 const references=new Set(['supabase',new URL(publicConfiguration.vars.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]])
 const cookie=[...references].map(ref=>'sb-'+ref+'-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')).join('; ')
 try{
  for(const path of ['/','/games/stickman-fights']){
   const response=await worker.dispatchFetch('https://chibaskogames.fr'+path)
   const html=await response.text()
   const manifestError=html.match(/Unexpected loadManifest\([^)]*\) call!/)?.[0]
   assert.equal(response.status,200,'Échec de rendu du Worker pour '+path+(manifestError?' : '+manifestError:''))
   assert.match(response.headers.get('content-type')??'',/text\/html/)
   assert.match(html,/Stickman Fights/)
   assert.doesNotMatch(html,/Unexpected loadManifest|<iframe\b/)
  }
  assert.ok(reads>0,'Le test doit traverser le rendu dynamique et ses lectures.')
  const response=await worker.dispatchFetch('https://chibaskogames.fr/players/@joueur-actuel')
  assert.equal(response.status,200)
  const html=await response.text()
  assert.match(html,/https:\/\/chibaskogames.fr\/players\/@joueur-actuel/)
  assert.ok(html.includes('ADMIN'),JSON.stringify({profileIdentifiers,visible:html.replace(/<script\b[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ').slice(-1300),digests:html.match(/NEXT_[A-Z_]+[^"<]*/g)}))
  assert.match(html,/DÉVELOPPEUR/)
  assert.equal(profileReads,1,'Les métadonnées et la page partagent leur résolution.')
  for(const identifier of [profile.id,'@ancien-pseudo','@JOUEUR-ACTUEL']){
   const previous=profileReads
   const redirect=await worker.dispatchFetch('https://chibaskogames.fr/players/'+identifier,{redirect:'manual'})
   if(redirect.status===307)assert.equal(redirect.headers.get('location'),'/players/@joueur-actuel')
   else{
    assert.equal(redirect.status,200)
    const document=await redirect.text()
    const refresh=document.match(/<meta\b[^>]*http-equiv="refresh"[^>]*>/i)?.[0]
    assert.ok(refresh?.includes('url=/players/@joueur-actuel'),'Le rendu streamé doit contenir la redirection native de Next.js vers le profil courant.')
   }
   assert.equal(profileReads,previous+1)
  }
  const missing=await worker.dispatchFetch('https://chibaskogames.fr/players/@inexistant')
  assert.ok([200,404].includes(missing.status))
  assert.match(await missing.text(),/<meta\b[^>]*name="robots"[^>]*content="noindex/)
  for(const identifier of ['@joueur-actuel',profile.id,'@ancien-pseudo']){
   const blocked=await worker.dispatchFetch('https://chibaskogames.fr/players/'+identifier,{headers:{Cookie:cookie}})
   const body=await blocked.text()
   assert.match(blocked.headers.get('cache-control'),/private.*no-store/)
   assert.match(body,/<meta\b[^>]*name="robots"[^>]*content="noindex/)
   assert.doesNotMatch(body,/Profil public de test\./)
  }
  const anonymous=await worker.dispatchFetch('https://chibaskogames.fr/players/@joueur-actuel')
  assert.match(await anonymous.text(),/Profil public de test\./,'Une réponse personnalisée ne doit pas contaminer la consultation anonyme.')
 }finally{await worker.dispose()}
})
