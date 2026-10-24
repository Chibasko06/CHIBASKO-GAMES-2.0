import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolve,dirname,join} from 'node:path'
import {existsSync,readdirSync} from 'node:fs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

const category={id:'11111111-1111-4111-8111-111111111111',name:'Action',slug:'action',created_at:'2026-01-01T00:00:00Z'}
const game={id:'22222222-2222-4222-8222-222222222222',title:'Stickman Fights',slug:'stickman-fights',
 game_url:'https://legacy.example.test/index.html',thumbnail_url:null,description:'Un jeu de combat navigateur.',
 developer_name:'Studio de test',release_date_text:null,mobile_compatible:'oui',technology:'HTML5',provider_name:null,
 source_page_url:null,views_count:1,play_count:0,is_published:true,created_at:category.created_at,
 game_type:'classic',multiplayer_game_id:null,is_beta:false,active_version_id:null,catalogue_source:'legacy',
 categories:[category],favorites_count:0,ratings_count:0,average_rating:0,comments_count:0,likes_count:0,dislikes_count:0}

test('le Worker OpenNext démarre et rend les pages dynamiques sans accès distant',{timeout:60000},async()=>{
 const bundle=resolve(process.env.CLOUDFLARE_RUNTIME_BUNDLE??'.distribution/runtime-smoke/worker.js')
 assert.ok(existsSync(bundle),'Construire le Worker et son bundle Wrangler avant ce test.')
 let reads=0
 const worker=new Miniflare(convertV4MiniflareOptions({
  modules:[{type:'ESModule',path:bundle},...readdirSync(dirname(bundle)).filter(name=>name.endsWith('.wasm'))
   .map(name=>({type:'CompiledWasm',path:join(dirname(bundle),name)}))],
  compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],
  bindings:{NEXT_PUBLIC_SUPABASE_URL:'https://supabase.example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public-key',
   NEXT_PUBLIC_SITE_URL:'https://chibaskogames.fr',CHIBASKO_CLOUDFLARE:'1',CONTACT_FORM_ENABLED:'0',
   GAME_ACCOUNT_DELETIONS_ENABLED:'0',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'0'},
  serviceBindings:{ASSETS:()=>new Response(null,{status:404})},
  // Seules les lectures du catalogue sont simulées ; aucun service réel n'est appelé.
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
   throw Error('Requête non autorisée dans la fixture du Worker.')
  },
 }))
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
 }finally{await worker.dispose()}
})
