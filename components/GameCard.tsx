import { GameBadges, type GameBadgeData } from './multiplayer/GameBadges'
import Link from 'next/link'
import GameThumbnail from './GameThumbnail'
import type {CatalogueImage} from '@/lib/catalogueImages'
import styles from './GameCard.module.css'

type Props = {
  game: GameBadgeData & {
    id: string
    title: string
    slug: string
    thumbnail_url: string | null
    thumbnail_image?:CatalogueImage
    categories?: { id: string; name: string; slug: string }[]
    description?: string | null
    views_count?: number
    likes_count?: number
    dislikes_count?: number
    developer_name?: string | null
    technology?: string | null
  }
}

export function GameCard({ game }: Props) {
  return (
    <Link href={`/games/${game.slug}`} className={styles.link}>
      <article className={styles.card}>
        {game.thumbnail_url ? (
          <div className={styles.image}>
            <GameThumbnail
              src={game.thumbnail_url}
              image={game.thumbnail_image}
              alt={game.title}
              fill
              className="object-cover"
              sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            />
          </div>
        ) : (
          <div className={styles.image}>
            <span aria-hidden="true">🎮</span>
          </div>
        )}

        <div className={styles.body}>
          <h3 className={styles.title} title={game.title}>{game.title}</h3>
          <div className={styles.badges}><GameBadges game={game}/></div>
          <div className={styles.categories}>
            {game.categories?.slice(0,2).map(category=><span key={category.id} title={category.name}>{category.name}</span>)}
          </div>
          <p className={styles.description}>{game.description}</p>
          <div className={styles.stats}>
            <span>{game.views_count??0} vues</span><span>{game.likes_count??0} likes</span>
          </div>
          <div className={styles.footer}>
            <span title={game.developer_name??undefined}>{game.developer_name}</span>
            <span title={game.technology??undefined}>{game.technology}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}
