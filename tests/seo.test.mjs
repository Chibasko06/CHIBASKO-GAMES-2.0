import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {renderToStaticMarkup} from 'react-dom/server'
import {absoluteUrl,buildPageMetadata,privatePageMetadata,serializeJsonLd} from '../lib/seo.ts'
import {categoryMetadata,gameMetadata,gameStructuredData} from '../lib/seoCatalogue.ts'
import sitemap from '../app/sitemap.ts'
import robots from '../app/robots.ts'
import manifest from '../app/manifest.ts'
import GamesPage,{generateMetadata as catalogueMetadata} from '../app/games/page.tsx'
import GamePage,{generateMetadata as detailMetadata} from '../app/games/[slug]/page.tsx'
import Home from '../app/page.tsx'
import config from '../next.config.ts'

test('les pages suivantes du catalogue conservent leur canonical propre',async()=>{
 fixture()
 const metadata=await catalogueMetadata({searchParams:Promise.resolve({category:'action',page:'2',utm_source:'fixture'})})
 assert.equal(metadata.alternates.canonical,absoluteUrl('/games?category=action&page=2'))
 assert.match(String(metadata.title),/Page 2/)
})

const category={id:'category-action',name:'Action',slug:'action'}
export const game={id:'game-public',title:'Jeu de précision',slug:'jeu-de-precision',description:'Place la balle et vise les cibles dans ce jeu de précision.',is_published:true,game_type:'classic',active_version_id:null,thumbnail_url:null,game_url:'https://legacy.test/game',developer_name:'Studio de test',technology:'HTML5',views_count:12,play_count:0,created_at:'2026-10-01T12:00:00Z',categories:[category],likes_count:0,dislikes_count:0,ratings_count:0,average_rating:0,favorites_count:0,comments_count:0}
export function fixture(){
 globalThis.__productRows=[game,{...game,id:'private-game',title:'Brouillon',slug:'brouillon',is_published:false}]
 globalThis.__productCategories=[category,{id:'empty',name:'Vide',slug:'vide'}]
 globalThis.__productCategoryLinks=[{game_id:game.id,categories:category}]
 globalThis.__productRuntimes=[]
}

test('canonical origin is public and per-page metadata has consistent social previews',()=>{
 assert.equal(absoluteUrl('/games/test'),'https://chibaskogames.fr/games/test')
 const metadata=gameMetadata(game)
 assert.equal(metadata.title,'Jeu de précision - Jeu gratuit en ligne')
 assert.equal(metadata.alternates.canonical,absoluteUrl('/games/jeu-de-precision'))
 assert.equal(metadata.openGraph.type,'website')
 assert.equal(metadata.openGraph.description,metadata.description)
 assert.equal(metadata.twitter.description,metadata.description)
 assert.ok(!metadata.title.includes('| Chibasko Games'))
 assert.ok(metadata.description.length<=180)
 assert.notEqual(gameMetadata({...game,title:'Autre',description:null}).description,gameMetadata({...game,description:null}).description)
 assert.equal(buildPageMetadata({title:'Page',description:'Texte',path:'/developpeurs'}).openGraph.url,absoluteUrl('/developpeurs'))
})

test('real catalogue category pages have unique SSR headings, canonical and crawlable links',async()=>{
 fixture();globalThis.__productSearch='?category=action'
 const props={searchParams:Promise.resolve({category:'action',utm_source:'fixture'})}
 const metadata=await catalogueMetadata(props)
 assert.equal(metadata.alternates.canonical,absoluteUrl('/games?category=action'))
 assert.equal(metadata.title,categoryMetadata(category).title)
 const html=renderToStaticMarkup(await GamesPage(props))
 assert.match(html,/<h1[^>]*>Jeux Action<\/h1>/)
 assert.match(html,/href="\/games\?category=action"/)
 assert.match(html,/href="\/games\/jeu-de-precision"/)
 assert.doesNotMatch(html,/href="\/games\/brouillon"/)
 assert.equal((await catalogueMetadata({searchParams:Promise.resolve({search:'test'})})).robots.index,false)
 assert.equal((await catalogueMetadata({searchParams:Promise.resolve({category:'unknown'})})).robots.index,false)
  assert.equal((await catalogueMetadata({searchParams:Promise.resolve({category:'vide'})})).robots.index,false)
 globalThis.__productSearch=''
})

test('published detail has one exact h1, breadcrumb and no eager game iframe',async()=>{
 fixture()
 const props={params:Promise.resolve({slug:game.slug})}
 assert.equal((await detailMetadata(props)).title,gameMetadata(game).title)
 const html=renderToStaticMarkup(await GamePage(props))
 assert.equal((html.match(/<h1\b/g)??[]).length,1)
 assert.match(html,/>Jeu de précision<\/h1>/)
 assert.match(html,/Fil d’Ariane/)
 assert.match(html,/Studio de test/)
 assert.doesNotMatch(html,/<iframe\b/)
 assert.equal((await detailMetadata({params:Promise.resolve({slug:'brouillon'})})).robots.index,false)
 await assert.rejects(()=>GamePage({params:Promise.resolve({slug:'missing'})}),/NOT_FOUND/)
})

test('JSON-LD matches visible game data, avoids invented publisher and escapes script delimiters',()=>{
 const data=gameStructuredData(game)
 assert.equal(data['@graph'][0]['@type'],'VideoGame')
 assert.equal(data['@graph'][0].name,game.title)
 assert.equal(data['@graph'][0].publisher,undefined)
 assert.equal(data['@graph'][0].aggregateRating,undefined)
 assert.equal(data['@graph'][1]['@type'],'BreadcrumbList')
 const serialized=serializeJsonLd({description:'</script><script>alert(1)</script>'})
 assert.ok(!serialized.includes('<'))
 assert.equal(JSON.parse(serialized).description,'</script><script>alert(1)</script>')
})

test('sitemap contains existing populated categories and published games only, without fabricated dates',async()=>{
 fixture();const entries=await sitemap(),urls=entries.map(entry=>entry.url)
 for(const path of ['/','/games','/faq','/developpeurs','/games?category=action','/games/jeu-de-precision'])assert.ok(urls.includes(absoluteUrl(path)),path)
 assert.equal(new Set(urls).size,urls.length)
 assert.ok(!urls.some(url=>/brouillon|category=vide|\/admin|\/api\/|\/login|\/dashboard|\/developer\//.test(url)))
 assert.ok(entries.every(entry=>!entry.lastModified))
})

test('private routes have noindex without changing public indexing or preview protection',async()=>{
 assert.equal(privatePageMetadata.robots.index,false)
 assert.equal(privatePageMetadata.alternates.canonical,null)
 for(const path of ['login','register','reset-password','dashboard','favorites','auth','developer']){
  const {metadata}=await import(`../app/${path}/layout.tsx`)
  assert.equal(metadata.robots.index,false,path)
 }
 const rules=robots().rules
 assert.equal(rules.allow,'/')
 assert.ok(!rules.disallow.includes('/'))
 assert.ok(!rules.disallow.includes('/login'))
 const apiHeaders=(await config.headers()).find(rule=>rule.source==='/api/:path*').headers
 assert.ok(apiHeaders.some(header=>header.key==='X-Robots-Tag'&&header.value==='noindex, nofollow'))
 const root=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8')
 assert.match(root,/index: true/)
 assert.doesNotMatch(root,/canonical: siteConfig.url/)
 assert.equal(manifest().icons.length,2)
 assert.ok(manifest().icons.every(icon=>icon.sizes==='512x512'))
})

test('public robots has only the API exclusion and no Host directive',async()=>{
 const metadata=robots()
 assert.deepEqual(metadata,{
  rules:{userAgent:'*',allow:'/',disallow:['/api/']},
  sitemap:'https://chibaskogames.fr/sitemap.xml',
 })
 assert.equal(Object.hasOwn(metadata,'host'),false)
 for(const path of ['/multiplayer','/sitemap.xml','/icon.png','/games/chibasko-pong','/developpeurs','/confidentialite','/admin','/dashboard','/favorites','/login','/register','/reset-password']){
  assert.ok(!metadata.rules.disallow.some(prefix=>path.startsWith(prefix)),path)
 }
 assert.ok(metadata.rules.disallow.some(prefix=>'/api/developer/games'.startsWith(prefix)))
 const adminLayout=await readFile(new URL('../app/admin/layout.tsx',import.meta.url),'utf8')
 assert.match(adminLayout,/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
 for(const path of ['dashboard','favorites','login','register','reset-password']){
  const {metadata}=await import(`../app/${path}/layout.tsx`)
  assert.equal(metadata.robots.index,false,path)
 }
})

test('home has a single h1 and real category/game/multiplayer links',async()=>{
 fixture();const html=renderToStaticMarkup(await Home())
 assert.equal((html.match(/<h1\b/g)??[]).length,1)
 for(const url of ['/games','/games?category=action','/games/jeu-de-precision','/multiplayer'])assert.ok(html.includes(`href="${url}"`),url)
 assert.doesNotMatch(html,/<iframe\b/)
})
