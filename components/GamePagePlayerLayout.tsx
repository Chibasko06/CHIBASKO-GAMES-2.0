import type {ReactNode} from 'react'
import Link from 'next/link'
import HorizontalScroller from './HorizontalScroller'
import type {GameRecommendation} from '@/lib/catalogueRecommendations'
import styles from './GamePagePlayerLayout.module.css'
export default function GamePagePlayerLayout({children,recommendations,primaryCategoryId}:{children:ReactNode;recommendations:readonly GameRecommendation[];primaryCategoryId?:string}){
 return <div className={styles.layout} data-game-page-layout data-recommendations={recommendations.length>0}>
  <div className={styles.player} data-page-player>{children}</div>
  {recommendations.length>0?<aside className={styles.recommendations} aria-label="À découvrir aussi">
   <h2>À découvrir aussi</h2>
   <HorizontalScroller label="Jeux recommandés" className={styles.rail}>
    {recommendations.map(game=>{
     const category=game.categories.find(category=>category.id===primaryCategoryId)??game.categories[0]
     return <Link key={game.id} href={'/games/'+game.slug} className={styles.card}>
      <div className={styles.image}>{game.thumbnail_url?
       // eslint-disable-next-line @next/next/no-img-element
       <img src={game.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span aria-hidden="true">🎮</span>}</div>
      <span className={styles.copy}><strong>{game.title}</strong>{category?<small>{category.name}</small>:null}</span>
     </Link>
    })}
   </HorizontalScroller>
  </aside>:null}
 </div>
}
