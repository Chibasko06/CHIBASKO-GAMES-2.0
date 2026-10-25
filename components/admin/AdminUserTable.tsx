import Image from 'next/image'
import RoleBadges from '@/components/RoleBadges'
import type { Tables } from '@/types/database'
import type { ProfileRoles } from '@/lib/profileRoles'

export type AdminUser = Tables<'profiles'> & { email: string | null; roles?: ProfileRoles }
export default function AdminUserTable({ users, busy, actor, onEdit, onDelete }: { users: AdminUser[]; busy: boolean; actor?: string; onEdit: (user: AdminUser) => void; onDelete: (id: string) => void }) {
  return <table className="admin-table">
    <caption className="sr-only">Utilisateurs de Chibasko Games</caption>
    <thead>
      <tr>
        <th scope="col">Membre</th>
        <th scope="col">Rôles</th>
        <th scope="col">Inscription</th>
        <th scope="col">Actions</th>
      </tr>
    </thead>
    <tbody>{users.map(user =>
      <tr key={user.id}>
        <td>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-950 text-cyan-200" aria-hidden="true">{user.avatar_url ? <Image src={user.avatar_url} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover" /> : user.username[0]?.toUpperCase()}</div>
            <div className="min-w-0">
              <p className="break-words font-semibold text-white">{user.username}</p>
              <p className="break-all text-xs text-zinc-400">{user.email || 'E-mail non disponible'}</p>{user.bio && <p className="mt-1 line-clamp-1 break-words text-xs text-zinc-500">{user.bio}</p>}</div>
          </div>
        </td>
        <td>
          <RoleBadges roles={user.roles} />{!user.roles?.admin && !user.roles?.developer && <span className="text-xs text-zinc-500">Membre</span>}</td>
        <td className="text-xs text-zinc-400"><span className="admin-cell-label">Inscription : </span>{user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : '—'}</td>
        <td>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => onEdit(user)} className="admin-action">Modifier<span className="sr-only"> {user.username}</span>
            </button>
            <button type="button" disabled={busy || user.id === actor} title={user.id === actor ? 'Utilisez la suppression personnelle dans le tableau de bord' : undefined} onClick={() => onDelete(user.id)} className="admin-action text-rose-300">Supprimer<span className="sr-only"> {user.username}</span>
            </button>
          </div>
        </td>
      </tr>)}</tbody>
  </table>
}
