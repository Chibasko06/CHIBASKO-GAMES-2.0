import {createRoot} from 'react-dom/client'
import {Navbar} from '../../components/Navbar'
import HorizontalScroller from '../../components/HorizontalScroller'
import {GameCard} from '../../components/GameCard'
import GamePagePlayerLayout from '../../components/GamePagePlayerLayout'
import GameViewport from '../../components/GameViewport'
const games=Array.from({length:12},(_,i)=>({id:'fixture-'+i,slug:'fixture-'+i,title:'Jeu '+(i+1),thumbnail_url:'/cover.svg',categories:[{id:'action',slug:'action',name:'Action'}],is_published:true}))
type Options={page:'home'|'game'|'admin';count?:number}
declare global{interface Window{catalogueFixture:{render(options:Options):void}}}
const root=createRoot(document.getElementById('root')!)
window.catalogueFixture={render({page,count=12}){root.render(<><Navbar/><main className="site-content mx-auto w-full max-w-[2200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10 2xl:px-12">
 <div data-stacking-probe style={{position:'relative',zIndex:4,transform:'translateZ(0)',minHeight:100,background:'#111827',padding:16}}>Catalogue Chibasko Games · {page}</div>
 {page==='home'?<section><h2>Action</h2><HorizontalScroller label="Action">{games.slice(0,count).map(game=><GameCard key={game.id} game={game}/>)}</HorizontalScroller></section>
 :page==='game'?<GamePagePlayerLayout recommendations={games.slice(0,5)}><GameViewport gameId="fixture" title="Stickman Fights" developerName="Fixture Studio" gameUrl="https://legacy.test/" initialLikes={0} initialDislikes={0}/></GamePagePlayerLayout>
 :<section style={{position:'relative',zIndex:10}}>Administration</section>}
 </main></>)}}
