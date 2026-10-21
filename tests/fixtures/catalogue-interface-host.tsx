import {createRoot} from 'react-dom/client'
import {Navbar} from '../../components/Navbar'
import HorizontalScroller from '../../components/HorizontalScroller'
import {GameCard} from '../../components/GameCard'
import GamePagePlayerLayout from '../../components/GamePagePlayerLayout'
import GameViewport from '../../components/GameViewport'
type FixtureGame=import('react').ComponentProps<typeof GameCard>['game'] & {is_published:boolean;categories:{id:string;slug:string;name:string}[]}
const games=Array.from({length:16},(_,i):FixtureGame=>({
 id:'fixture-'+i,slug:'fixture-'+i,title:i===4?'Chibasko Pong':'Jeu '+(i+1),thumbnail_url:i%4===1?null:'/cover.svg',
 categories:[{id:'action',slug:'action',name:'Action'},{id:'arcade',slug:'arcade',name:'Arcade'}],is_published:true,
 game_type:i===4?'multiplayer_chibasko':'classic',is_beta:i===4,
 runtime_capabilities:i===4?{online:{access:['public','private'],players:{min:2,max:2}}}:undefined,
 description:i%3===0?'Une description volontairement longue pour vérifier la limite de deux lignes sans agrandir la carte. '.repeat(4):undefined,
 developer_name:i===4?'Chibasko Games':i%2?'Studio de développement avec un nom long':undefined,technology:i%2?'HTML5':undefined,
}))

type Options={page:'home'|'game'|'admin';count?:number}
declare global{interface Window{catalogueFixture:{render(options:Options):void}}}
const root=createRoot(document.getElementById('root')!)
window.catalogueFixture={render({page,count=12}){root.render(<><Navbar/><main className="site-content mx-auto w-full max-w-[2200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10 2xl:px-12">
 <div data-stacking-probe style={{position:'relative',zIndex:4,transform:'translateZ(0)',minHeight:100,background:'#111827',padding:16}}>Catalogue Chibasko Games · {page}</div>
 {page==='home'?<section><h2>Action</h2><HorizontalScroller label="Action">{games.slice(0,Math.min(count,10)).map(game=><GameCard key={game.id} game={game}/>)}</HorizontalScroller></section>
 :page==='game'?<GamePagePlayerLayout recommendations={games.slice(0,5)}><GameViewport gameId="fixture" title="Stickman Fights" developerName="Fixture Studio" gameUrl="https://legacy.test/" initialLikes={0} initialDislikes={0}/></GamePagePlayerLayout>
 :<section style={{position:'relative',zIndex:10}}>Administration</section>}
 </main></>)}}
