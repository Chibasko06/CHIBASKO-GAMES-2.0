import AccountAccessBoundary from '@/components/AccountAccessBoundary'
import {privatePageMetadata} from '@/lib/seo'
import DeveloperNavigation from '@/components/DeveloperNavigation'
export const metadata=privatePageMetadata
export default function Layout({children}:{children:React.ReactNode}){return <AccountAccessBoundary><div className="mx-auto max-w-6xl space-y-6 px-4 py-6"><p className="text-sm font-semibold uppercase tracking-wider text-cyan-300">Espace développeur</p><DeveloperNavigation/>{children}</div></AccountAccessBoundary>}
