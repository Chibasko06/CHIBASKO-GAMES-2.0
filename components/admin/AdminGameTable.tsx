import Image from 'next/image'
import Link from 'next/link'
import type { Tables } from '@/types/database'
export type AdminGame = Tables<'games'> & { game_categories?: { category_id: string }[] }
export default function AdminGameTable({ games, busy, onEdit, onDelete }: { games: AdminGame[]; busy: boolean; onEdit: (game: AdminGame) => void; onDelete: (id: string) => void }) {
  return <table className="admin-table">
    <caption className="sr-only">Catalogue administré</caption>
    <thead>
      <tr>
        <th scope="col">Jeu</th>
        <th scope="col">Statut</th>
        <th scope="col">Type</th>
        <th scope="col">Actions</th>
      </tr>
    </thead>
    <tbody>{games.map(game =>
      <tr key={game.id}>
        <td>
          <div className="flex min-w-0 items-center gap-3">{game.thumbnail_url && <Image src={game.thumbnail_url} alt="" width={64} height={36} unoptimized className="aspect-video w-16 shrink-0 rounded object-cover" />}<div className="min-w-0">
            <p className="break-words font-semibold text-white">{game.title}</p>
            <p className="break-words text-xs text-zinc-500">{game.developer_name || 'Développeur non renseigné'}</p>
            <p className="text-xs text-zinc-500">{game.game_categories?.length ?? 0} catégorie(s)</p>
          </div>
          </div>
        </td>
        <td>
          <span className={'inline-flex rounded-md border px-2 py-1 text-xs ' + (game.is_published ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' : 'border-zinc-700 text-zinc-400')}>{game.is_published ? (game.is_beta ? 'Bêta publiée' : 'Publié') : 'Masqué'}</span>
        </td>
        <td className="text-xs text-zinc-400">{game.game_type === 'multiplayer_chibasko' ? 'SDK / multijoueur' : game.technology || 'HTML5'}</td>
        <td>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-action" disabled={busy} onClick={() => onEdit(game)}>Modifier<span className="sr-only"> {game.title}</span>
            </button>{game.is_published && <Link className="admin-action text-cyan-300" href={'/games/' + game.slug}>Voir<span className="sr-only"> {game.title}</span>
            </Link>}<button type="button" className="admin-action text-rose-300" disabled={busy} onClick={() => onDelete(game.id)}>Supprimer<span className="sr-only"> {game.title}</span>
            </button>
          </div>
        </td>
      </tr>)}</tbody>
  </table>
}
