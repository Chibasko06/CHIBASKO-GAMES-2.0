export default function AdminPagination({ page, total, busy, onPage, label }: { page: number; total: number; busy: boolean; onPage: (page: number) => void; label: string }) {
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 text-sm">
    <p className="text-zinc-400">{total.toLocaleString('fr-FR')} résultat(s) · Page {page} sur {Math.max(1, Math.ceil(total / 50))}</p>
    <div className="flex gap-2">
      <button type="button" className="admin-action" disabled={busy || page === 1} onClick={() => onPage(page - 1)}>Précédent</button>
      <button type="button" className="admin-action" disabled={busy || page * 50 >= total} onClick={() => onPage(page + 1)}>Suivant</button>
    </div>
  </nav>
}
