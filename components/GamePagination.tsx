import Link from 'next/link'

type Props = { page: number; total: number; pageHref: (page: number) => string; label: string }

export default function GamePagination({ page, total, pageHref, label }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / 24))
  const pageNumbers = totalPages <= 7
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [...new Set([1, page - 1, page, page + 1, totalPages])].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b)
  const paginationControl = 'inline-flex min-h-11 min-w-10 items-center justify-center rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300'
  const paginationLink = paginationControl + ' border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-cyan-500 hover:bg-cyan-950/40 hover:text-cyan-200'

  return (
      <nav aria-label={label} className="flex flex-col items-center gap-3 border-t border-zinc-800 pt-6">
        <div className="flex items-center justify-center gap-1 sm:gap-2">
          {page > 1 ? <Link href={pageHref(page - 1)} prefetch={false} rel="prev" aria-label="Précédent" className={paginationLink}>
            <span aria-hidden="true">‹</span><span className="ml-2 hidden sm:inline">Précédent</span>
          </Link> : <button type="button" disabled aria-label="Précédent" className={paginationControl + ' border-zinc-800 text-zinc-600 disabled:cursor-not-allowed'}>
            <span aria-hidden="true">‹</span><span className="ml-2 hidden sm:inline">Précédent</span>
          </button>}
          {pageNumbers.map((number, index) => <span key={number} className="contents">
            {index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true" className="hidden px-1 text-zinc-500 sm:inline">…</span>}
            <Link href={pageHref(number)} prefetch={false} aria-label={'Page ' + number} aria-current={number === page ? 'page' : undefined}
              className={(Math.abs(number - page) > 1 ? 'max-sm:hidden ' : '') + (number === page
                ? paginationControl + ' border-cyan-400 bg-cyan-400 font-bold text-black shadow-[0_0_18px_-6px_rgba(34,211,238,0.65)]'
                : paginationLink)}>{number}</Link>
          </span>)}
          {page < totalPages ? <Link href={pageHref(page + 1)} prefetch={false} rel="next" aria-label="Suivant" className={paginationLink}>
            <span className="mr-2 hidden sm:inline">Suivant</span><span aria-hidden="true">›</span>
          </Link> : <button type="button" disabled aria-label="Suivant" className={paginationControl + ' border-zinc-800 text-zinc-600 disabled:cursor-not-allowed'}>
            <span className="mr-2 hidden sm:inline">Suivant</span><span aria-hidden="true">›</span>
          </button>}
        </div>
        <p className="text-xs text-zinc-400">Page <span className="font-semibold text-zinc-200">{page}</span> sur {totalPages}</p>
      </nav>
  )
}
