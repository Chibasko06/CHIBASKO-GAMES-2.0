import type { ProfileRoles } from '@/lib/profileRoles'

export default function RoleBadges({ roles }: { roles?: ProfileRoles }) {
  if (!roles?.admin && !roles?.developer) return null
  return <span className="inline-flex flex-wrap gap-2" aria-label="Rôles publics">
    {roles.admin && <span className="inline-flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold tracking-wider text-cyan-200">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </svg>ADMIN</span>}
    {roles.developer && <span className="inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 py-1 text-[10px] font-bold tracking-wider text-violet-200">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />
      </svg>DÉVELOPPEUR</span>}
  </span>
}
